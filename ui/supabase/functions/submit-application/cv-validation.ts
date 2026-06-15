export const MAX_CV_FILE_SIZE = 5 * 1024 * 1024
export const MAX_CV_FILE_NAME_LENGTH = 255

const UNSUPPORTED_FILE_MESSAGE = "Chỉ hỗ trợ file PDF, DOC hoặc DOCX"
const GENERIC_MIME_TYPES = new Set(["", "application/octet-stream"])

const FORMAT_BY_EXTENSION = {
  pdf: {
    mimeTypes: new Set(["application/pdf"]),
  },
  doc: {
    mimeTypes: new Set(["application/msword"]),
  },
  docx: {
    mimeTypes: new Set([
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]),
  },
} as const

type CvExtension = keyof typeof FORMAT_BY_EXTENSION

export type CvValidationFailure = {
  valid: false
  status: 400 | 413
  code:
    | "VALIDATION_ERROR"
    | "CV_FILE_NAME_TOO_LONG"
    | "INVALID_CV_TYPE"
    | "CV_TOO_LARGE"
    | "INVALID_CV_MIME"
    | "INVALID_CV_CONTENT"
  message: string
}

export type CvValidationResult =
  | {valid: true; extension: CvExtension}
  | CvValidationFailure

const startsWithBytes = (bytes: Uint8Array, signature: number[]) =>
  signature.every((value, index) => bytes[index] === value)

const hasPdfSignature = (bytes: Uint8Array) =>
  startsWithBytes(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])

const hasOleSignature = (bytes: Uint8Array) =>
  startsWithBytes(bytes, [
    0xd0,
    0xcf,
    0x11,
    0xe0,
    0xa1,
    0xb1,
    0x1a,
    0xe1,
  ])

const readUint16 = (bytes: Uint8Array, offset: number) =>
  bytes[offset] | (bytes[offset + 1] << 8)

const readUint32 = (bytes: Uint8Array, offset: number) =>
  (bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)) >>>
  0

const findEndOfCentralDirectory = (bytes: Uint8Array) => {
  const minimumOffset = Math.max(0, bytes.length - 65_557)

  for (let offset = bytes.length - 22; offset >= minimumOffset; offset -= 1) {
    if (
      bytes[offset] === 0x50 &&
      bytes[offset + 1] === 0x4b &&
      bytes[offset + 2] === 0x05 &&
      bytes[offset + 3] === 0x06
    ) {
      return offset
    }
  }

  return -1
}

const hasDocxStructure = (bytes: Uint8Array) => {
  if (!startsWithBytes(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    return false
  }

  const endOffset = findEndOfCentralDirectory(bytes)

  if (endOffset < 0 || endOffset + 22 > bytes.length) {
    return false
  }

  const entryCount = readUint16(bytes, endOffset + 10)
  let offset = readUint32(bytes, endOffset + 16)
  const requiredEntries = new Set(["[Content_Types].xml", "word/document.xml"])
  const decoder = new TextDecoder()

  for (let index = 0; index < entryCount; index += 1) {
    if (
      offset + 46 > bytes.length ||
      readUint32(bytes, offset) !== 0x02014b50
    ) {
      return false
    }

    const fileNameLength = readUint16(bytes, offset + 28)
    const extraLength = readUint16(bytes, offset + 30)
    const commentLength = readUint16(bytes, offset + 32)
    const fileNameStart = offset + 46
    const fileNameEnd = fileNameStart + fileNameLength

    if (fileNameEnd > bytes.length) {
      return false
    }

    requiredEntries.delete(
      decoder.decode(bytes.subarray(fileNameStart, fileNameEnd)),
    )

    offset = fileNameEnd + extraLength + commentLength
  }

  return requiredEntries.size === 0
}

const contentMatchesExtension = (
  extension: CvExtension,
  bytes: Uint8Array,
) => {
  switch (extension) {
    case "pdf":
      return hasPdfSignature(bytes)
    case "doc":
      return hasOleSignature(bytes)
    case "docx":
      return hasDocxStructure(bytes)
  }
}

export const validateCvFile = async (
  file: File,
): Promise<CvValidationResult> => {
  if (file.size === 0) {
    return {
      valid: false,
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Vui lòng đính kèm CV",
    }
  }

  if ([...file.name].length > MAX_CV_FILE_NAME_LENGTH) {
    return {
      valid: false,
      status: 400,
      code: "CV_FILE_NAME_TOO_LONG",
      message: "Tên file CV quá dài",
    }
  }

  const extension = file.name.split(".").pop()?.toLowerCase()

  if (!extension || !(extension in FORMAT_BY_EXTENSION)) {
    return {
      valid: false,
      status: 400,
      code: "INVALID_CV_TYPE",
      message: UNSUPPORTED_FILE_MESSAGE,
    }
  }

  if (file.size > MAX_CV_FILE_SIZE) {
    return {
      valid: false,
      status: 413,
      code: "CV_TOO_LARGE",
      message: "File CV không được vượt quá 5MB",
    }
  }

  const cvExtension = extension as CvExtension
  const normalizedMimeType = file.type.toLowerCase().trim()
  const acceptedMimeTypes = FORMAT_BY_EXTENSION[cvExtension].mimeTypes

  if (
    !GENERIC_MIME_TYPES.has(normalizedMimeType) &&
    !acceptedMimeTypes.has(normalizedMimeType)
  ) {
    return {
      valid: false,
      status: 400,
      code: "INVALID_CV_MIME",
      message: UNSUPPORTED_FILE_MESSAGE,
    }
  }

  const bytes = new Uint8Array(await file.arrayBuffer())

  if (!contentMatchesExtension(cvExtension, bytes)) {
    return {
      valid: false,
      status: 400,
      code: "INVALID_CV_CONTENT",
      message: UNSUPPORTED_FILE_MESSAGE,
    }
  }

  return {valid: true, extension: cvExtension}
}

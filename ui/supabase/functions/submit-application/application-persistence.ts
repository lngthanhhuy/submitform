const CV_BUCKET = "cv ung tuyen"

type PersistenceError = {
  message?: string
}

type ApplicationInsert = {
  last_name: string
  first_name: string
  email: string
  position_id: string
  cv_path: string
  cover_letter: string
  submission_source: "edge_function"
  hr_email_status: "pending"
}

export type ApplicationInput = {
  lastname: string
  firstname: string
  email: string
  positionId: string
  coverletter: string
  cv: File
  extension: "pdf" | "doc" | "docx"
}

export type PersistenceDependencies = {
  upload: (
    bucket: string,
    path: string,
    file: File,
    contentType: string,
  ) => Promise<{error: PersistenceError | null}>
  insert: (
    application: ApplicationInsert,
  ) => Promise<{
    data: {id: string; created_at: string} | null
    error: PersistenceError | null
  }>
  remove: (
    bucket: string,
    paths: string[],
  ) => Promise<{error: PersistenceError | null}>
  createId?: () => string
}

export type PersistenceResult =
  | {
    success: true
    applicationId: string
    createdAt: string
    cvPath: string
  }
  | {
    success: false
    status: 500
    code:
      | "CV_UPLOAD_FAILED"
      | "APPLICATION_INSERT_FAILED"
      | "ROLLBACK_FAILED"
    message: string
    cause?: string
    rollbackCause?: string
  }

const MIME_TYPES = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx:
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const

const errorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message
  }

  return "Unknown persistence error"
}

export const persistApplication = async (
  input: ApplicationInput,
  dependencies: PersistenceDependencies,
): Promise<PersistenceResult> => {
  const createId = dependencies.createId ?? (() => crypto.randomUUID())
  const cvPath =
    `edge/${input.positionId}/${createId()}.${input.extension}`
  const contentType = MIME_TYPES[input.extension]
  let uploadResult: Awaited<ReturnType<PersistenceDependencies["upload"]>>

  try {
    uploadResult = await dependencies.upload(
      CV_BUCKET,
      cvPath,
      input.cv,
      contentType,
    )
  } catch (error) {
    return {
      success: false,
      status: 500,
      code: "CV_UPLOAD_FAILED",
      message: "Không thể lưu file CV",
      cause: errorMessage(error),
    }
  }

  if (uploadResult.error) {
    return {
      success: false,
      status: 500,
      code: "CV_UPLOAD_FAILED",
      message: "Không thể lưu file CV",
      cause: errorMessage(uploadResult.error),
    }
  }

  let insertResult:
    | Awaited<ReturnType<PersistenceDependencies["insert"]>>
    | undefined
  let insertThrownError: unknown

  try {
    insertResult = await dependencies.insert({
      last_name: input.lastname,
      first_name: input.firstname,
      email: input.email,
      position_id: input.positionId,
      cv_path: cvPath,
      cover_letter: input.coverletter,
      submission_source: "edge_function",
      hr_email_status: "pending",
    })
  } catch (error) {
    insertThrownError = error
  }

  if (insertResult && !insertResult.error && insertResult.data) {
    return {
      success: true,
      applicationId: insertResult.data.id,
      createdAt: insertResult.data.created_at,
      cvPath,
    }
  }

  const insertCause = insertThrownError ?? insertResult?.error
  let rollbackResult:
    | Awaited<ReturnType<PersistenceDependencies["remove"]>>
    | undefined
  let rollbackThrownError: unknown

  try {
    rollbackResult = await dependencies.remove(CV_BUCKET, [cvPath])
  } catch (error) {
    rollbackThrownError = error
  }

  if (rollbackThrownError || rollbackResult?.error) {
    return {
      success: false,
      status: 500,
      code: "ROLLBACK_FAILED",
      message: "Không thể lưu hồ sơ và không thể dọn file CV",
      cause: errorMessage(insertCause),
      rollbackCause: errorMessage(
        rollbackThrownError ?? rollbackResult?.error,
      ),
    }
  }

  return {
    success: false,
    status: 500,
    code: "APPLICATION_INSERT_FAILED",
    message: "Không thể lưu hồ sơ ứng tuyển",
    cause: errorMessage(insertCause),
  }
}

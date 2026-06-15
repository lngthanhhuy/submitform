import { z } from "zod"

export const MAX_CV_SIZE = 5 * 1024 * 1024
export const MAX_CV_FILE_NAME_LENGTH = 255

const getFileExtension = (fileName: string) =>
  fileName.split(".").pop()?.toLowerCase()

export const careerFormSchema = z.object({
  firstname: z.string().trim().min(1, "Vui lòng nhập tên"),
  lastname: z.string().trim().min(1, "Vui lòng nhập họ"),
  email: z.string()
    .trim()
    .min(1, "Vui lòng nhập email")
    .email("Email không hợp lệ"),
  positionId: z.string().min(1, "Vui lòng chọn vị trí ứng tuyển"),
  cv: z.instanceof(File, {message: "Vui lòng đính kèm CV"})
    .refine((file) => file.size > 0, "Vui lòng đính kèm CV")
    .refine(
      (file) => file.name.length <= MAX_CV_FILE_NAME_LENGTH,
      "Tên file CV quá dài",
    )
    .refine(
      (file) => ["pdf", "doc", "docx"].includes(
        getFileExtension(file.name) ?? "",
      ),
      "Chỉ hỗ trợ file PDF, DOC hoặc DOCX",
    )
    .refine(
      (file) => file.size <= MAX_CV_SIZE,
      "File CV không được vượt quá 5MB",
    ),
  coverletter: z.string()
    .trim()
    .min(1, "Vui lòng nhập thư giới thiệu")
    .max(1000, "Giới thiệu bản thân không được vượt quá 1000 ký tự"),
})

export type CareerFormValues = z.infer<typeof careerFormSchema>

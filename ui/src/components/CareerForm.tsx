import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { useEffect, useState, } from "react"
import { supabase } from "@/config/supabaseClient"
import { toast } from "react-toastify"
import { Textarea } from "./ui/textarea"
import {z} from "zod"
import {Controller, useForm} from 'react-hook-form'
import {zodResolver} from '@hookform/resolvers/zod'

type Position = {
  id: string
  title: string
}

const MAX_CV_SIZE = 5 * 1024 * 1024
const CV_BUCKET = "cv ung tuyen"
const DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

const getFileExtension = (fileName: string) =>
  fileName.split(".").pop()?.toLowerCase()

const careerFormSchema = z.object({
  firstname: z.string().trim().min(1, 'Tên bắt buộc phải có'),
  lastname: z.string().trim().min(1, 'Họ bắt buộc phải có'),
  email: z.string().trim().email('Email không hợp lệ'),
  positionId: z.string().min(1, 'Chọn 1 vị trí ứng tuyển'),
  cv: z.instanceof(File, {message: 'Chọn CV'})
    .refine((file) => file.size > 0, 'Chọn CV')
    .refine(
      (file) => ["pdf", "docx"].includes(getFileExtension(file.name) ?? ""),
      'CV chỉ chấp nhận file PDF hoặc DOCX',
    )
    .refine(
      (file) => file.size <= MAX_CV_SIZE,
      'CV không được vượt quá 5MB',
    ),
  coverletter: z.string()
    .trim()
    .min(1, 'Nhập thư giới thiệu')
    .max(1000, 'Giới thiệu bản thân không vượt quá 1000 ký tự'),
});

// typeOf: Lấy kiểu dữ liệu của careerFormSchema
// infer: Tự suy ra kiểu
type CareerFormValues = z.infer<typeof careerFormSchema>

const CareerForm = () => {
  const [positions, setPositions] = useState<Position[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [fileInputKey, setFileInputKey] = useState(0)
  useEffect(() => {
    const loadPositions = async () => {
      const {data, error} = await supabase
        .from("positions")
        .select("id, title")
        .eq("is_active", true)
        .order("title")

      if (error) {
        console.error(error)
        toast.error("Không thể tải danh sách vị trí")
        setIsLoading(false)
        return
      }

      setPositions(data ?? [])
      setIsLoading(false)
    }

    loadPositions()
  }, [])

  // Quản lí trạng thái và sk của form
  const {control, register, handleSubmit, reset, formState: {errors, isSubmitting}} = useForm<CareerFormValues>({
    resolver: zodResolver(careerFormSchema),
    defaultValues: {
      firstname: "",
      lastname: "",
      email: "",
      positionId: "",
      coverletter: "",
    },
  });

  const onSubmit = async (data: CareerFormValues) => {
    const extension = getFileExtension(data.cv.name)
    const safeName = data.cv.name.replace(/[^a-zA-Z0-9._-]/g, "_")
    const cvPath =
      `cv/${data.positionId}/${crypto.randomUUID()}_${safeName}`
    const contentType =
      extension === "pdf" ? "application/pdf" : DOCX_MIME_TYPE

    try {
      const {error: uploadError} = await supabase.storage
        .from(CV_BUCKET)
        .upload(cvPath, data.cv, {
          contentType,
          upsert: false,
        })

      if (uploadError) {
        throw uploadError
      }

      const {error: insertError} = await supabase
        .from("applications")
        .insert({
          last_name: data.lastname,
          first_name: data.firstname,
          email: data.email,
          position_id: data.positionId,
          cv_path: cvPath,
          cover_letter: data.coverletter,
        })

      if (insertError) {
        throw insertError
      }

      toast.success("Hồ sơ của bạn đã được gửi thành công!")
      reset()
      setFileInputKey((currentKey) => currentKey + 1)
    } catch (error) {
      console.error("Gửi hồ sơ thất bại:", error)
      toast.error("Không thể gửi hồ sơ. Vui lòng thử lại.")
    }
  }

  return (
    <form
      onSubmit={handleSubmit(
        onSubmit,
        (validationErrors) => console.log("Zod validation failed:", validationErrors),
      )}
      noValidate
      className="border border-border bg-background p-6 shadow-sm sm:p-10"
    >
      <div className="flex flex-col gap-8">
        <div className="flex flex-col items-center text-center gap-2">
          <a href="/"
            className="mx-auto block w-fit text-center"
          ></a>
          <h1 className="text-2xl font-bold">Form ứng tuyển</h1>
          <p className="text-muted-foreground text-balance">
            Chào mừng bạn! Điền thông tin bên dưới để bắt đầu!
          </p>
        </div>
        {/* full name */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="lastname" className="block text-sm">
              Họ
            </Label>
            <Input
              type="text"
              id="lastname"
              required
              {...register("lastname")}
            />
            {/* error message */}
            {errors.lastname && (
              <p className="text-destructive text-sm">
                {errors.lastname.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="firstname" className="block text-sm">
              Tên
            </Label>
            <Input
              type="text"
              id="firstname"
              required
              {...register("firstname")}
            />
             {errors.firstname && (
              <p className="text-destructive text-sm">
                {errors.firstname.message}
              </p>
            )}
          </div>
        </div>
        {/* email */}
        <div className="flex flex-col gap-3">
          <Label htmlFor="email" className="block text-sm">
            Email
          </Label>
          <Input
            type="email"
            id="email"
            placeholder="huy@gmail.com"
            required
            {...register("email")}
          />
           {errors.email && (
              <p className="text-destructive text-sm">
                {errors.email.message}
              </p>
            )}
        </div>
        {/* vị trí ứng tuyển */}
        <div className="flex flex-col gap-3">
          <Label htmlFor="vi-tri" className="block text-sm">
            Vị trí ứng tuyển
          </Label>
          <Controller
            name="positionId"
            control={control}
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={field.onChange}
                disabled={isLoading}
              >
                <SelectTrigger id="vi-tri" className="w-full">
                  <SelectValue placeholder={
                    isLoading ? "Đang tải dữ liệu" : "Chọn vị trí ứng tuyển"
                  }/>
                </SelectTrigger>

                <SelectContent>
                  {positions.map((e) => {
                    return (
                      <SelectItem key={e.id}
                      value={e.id}>
                        {e.title}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            )}
          />
           {errors.positionId && (
              <p className="text-destructive text-sm">
                {errors.positionId.message}
              </p>
            )}
        </div>
        {/* CV */}
        <div className="flex flex-col gap-3">
          <Label htmlFor="cv" className="block text-sm">
            CV đính kèm
          </Label>
          <Controller
            name="cv"
            control={control}
            render={({ field }) => (
              <Input
                key={fileInputKey}
                type="file"
                id="cv"
                name={field.name}
                ref={field.ref}
                onBlur={field.onBlur}
                disabled={field.disabled}
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                required
                className="h-auto cursor-pointer"
                onChange={(event) => field.onChange(event.target.files?.[0])}
              />
            )}
          />
           {errors.cv && (
              <p className="text-destructive text-sm">
                {errors.cv.message}
              </p>
            )}
        </div>
        {/* Cover letter */}
        <div className="flex flex-col gap-3">
          <Label htmlFor="cover-letter" className="block text-sm">
            Cover letter
          </Label>
          <Textarea
            id="cover-letter"
            placeholder="Thư giới thiệu bản thân (tối đa 1000 ký tự)..."
            {...register("coverletter")}
          />
           {errors.coverletter && (
              <p className="text-destructive text-sm">
                {errors.coverletter.message}
              </p>
            )}
        </div>
        {/* submit */}
        <Button
          type="submit"
          className="w-full"
          disabled={isSubmitting || isLoading}
        >
          {isSubmitting ? "Đang gửi hồ sơ..." : "Gửi đơn ứng tuyển"}
        </Button>
      </div>
    </form>
  )
}


export default CareerForm

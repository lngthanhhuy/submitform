import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { useEffect, useState, } from "react"
import { FunctionsHttpError } from "@supabase/supabase-js"
import { supabase } from "@/config/supabaseClient"
import { toast } from "react-toastify"
import { Textarea } from "./ui/textarea"
import {Controller, useForm} from 'react-hook-form'
import {zodResolver} from '@hookform/resolvers/zod'
import TurnstileWidget from "./TurnstileWidget"
import {careerFormSchema,type CareerFormValues,} from "./career-form-schema"

type Position = {
  id: string
  title: string
}

const SUBMIT_TIMEOUT_MS = 30_000
const TURNSTILE_ACTION = "submit_application"
const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA"
const TURNSTILE_SITE_KEY =
  import.meta.env.VITE_TURNSTILE_SITE_KEY ||
  (import.meta.env.DEV ? TURNSTILE_TEST_SITE_KEY : "")

type SubmitApplicationSuccess = {
  success: true
  code: "APPLICATION_SUBMITTED"
  applicationId: string
  hrEmailId: string
}

type SubmitApplicationError = {
  success?: false
  code?: string
  message?: string
  fieldErrors?: Record<string, string>
}

const CareerForm = () => {
  const [positions, setPositions] = useState<Position[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [fileInputKey, setFileInputKey] = useState(0)
  const [turnstileToken, setTurnstileToken] = useState("")
  const [turnstileError, setTurnstileError] = useState<string | null>(null)
  const [turnstileResetKey, setTurnstileResetKey] = useState(0)
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
  const {
    clearErrors,
    control,
    register,
    handleSubmit,
    reset,
    setError,
    formState: {errors, isSubmitting},
  } = useForm<CareerFormValues>({
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
    try {
      clearErrors()
      setTurnstileError(null)

      if (!turnstileToken) {
        setTurnstileError("Vui lòng xác nhận bạn không phải là robot")
        return
      }

      const formData = new FormData()
      formData.set("firstname", data.firstname.trim())
      formData.set("lastname", data.lastname.trim())
      formData.set("email", data.email.trim())
      formData.set("positionId", data.positionId)
      formData.set("coverletter", data.coverletter.trim())
      formData.set("turnstileToken", turnstileToken)
      formData.set("cv", data.cv, data.cv.name)

      const {data: response, error} =
        await supabase.functions.invoke<SubmitApplicationSuccess>(
          "submit-application",
          {
            body: formData,
            timeout: SUBMIT_TIMEOUT_MS,
          },
        )

      if (error) {
        let errorResponse: SubmitApplicationError | null = null

        if (error instanceof FunctionsHttpError) {
          try {
            errorResponse = await error.context.json()
          } catch {
            errorResponse = null
          }
        }

        if (errorResponse?.fieldErrors) {
          const formFields: Array<keyof CareerFormValues> = [
            "firstname",
            "lastname",
            "email",
            "positionId",
            "cv",
            "coverletter",
          ]

          for (const field of formFields) {
            const message = errorResponse.fieldErrors[field]

            if (message) {
              setError(field, {type: "server", message})
            }
          }

          return
        }

        if (errorResponse?.code === "INVALID_POSITION") {
          setError("positionId", {
            type: "server",
            message: errorResponse.message ?? "Vị trí ứng tuyển không hợp lệ",
          })
          return
        }

        if (
          errorResponse?.code === "CAPTCHA_REQUIRED" ||
          errorResponse?.code === "CAPTCHA_INVALID" ||
          errorResponse?.code === "CAPTCHA_UNAVAILABLE"
        ) {
          setTurnstileError(
            errorResponse.message ??
              "Không thể xác minh chống spam. Vui lòng thử lại",
          )
          return
        }

        if (errorResponse?.code === "RATE_LIMITED") {
          toast.error(
            errorResponse.message ??
              "Bạn đã gửi quá nhiều hồ sơ. Vui lòng thử lại sau",
          )
          return
        }

        throw error
      }

      if (
        !response ||
        response.success !== true ||
        response.code !== "APPLICATION_SUBMITTED"
      ) {
        throw new Error("Unexpected submit-application response")
      }

      toast.success("Hồ sơ của bạn đã được gửi thành công!")
      reset()
      setFileInputKey((currentKey) => currentKey + 1)
    } catch (error) {
      console.error("Gửi hồ sơ thất bại:", error)
      toast.error("Không thể gửi hồ sơ. Vui lòng thử lại sau")
    } finally {
      setTurnstileToken("")
      setTurnstileResetKey((currentKey) => currentKey + 1)
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
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
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
        {/* anti-spam verification */}
        <div className="flex flex-col gap-3">
          <Label className="block text-sm">
            Xác minh chống spam
          </Label>
          {TURNSTILE_SITE_KEY ? (
            <TurnstileWidget
              siteKey={TURNSTILE_SITE_KEY}
              action={TURNSTILE_ACTION}
              resetKey={turnstileResetKey}
              onTokenChange={(token) => {
                setTurnstileToken(token)

                if (token) {
                  setTurnstileError(null)
                }
              }}
              onError={() => {
                setTurnstileError(
                  "Không thể tải xác minh chống spam. Vui lòng thử lại",
                )
              }}
            />
          ) : (
            <p className="text-destructive text-sm">
              Chưa cấu hình Turnstile cho biểu mẫu
            </p>
          )}
          {turnstileError && (
            <p className="text-destructive text-sm">
              {turnstileError}
            </p>
          )}
        </div>
        {/* submit */}
        <Button
          type="submit"
          className="w-full"
          disabled={
            isSubmitting ||
            isLoading ||
            !TURNSTILE_SITE_KEY ||
            !turnstileToken
          }
        >
          {isSubmitting ? "Đang gửi hồ sơ..." : "Gửi đơn ứng tuyển"}
        </Button>
      </div>
    </form>
  )
}


export default CareerForm

import { createClient } from "@supabase/supabase-js"
import { sendHrApplicationEmail } from "../_shared/hr-email.ts"
import { persistApplication } from "./application-persistence.ts"
import { validateCvFile } from "./cv-validation.ts"
import {
  consumeApplicationRateLimit,
  getClientIp,
  hashClientIp,
} from "./rate-limit.ts"
import {
  MAX_TURNSTILE_TOKEN_LENGTH,
  verifyTurnstileToken,
} from "./turnstile.ts"

type FieldErrors = Record<string, string>

const corsHeaders = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Expose-Headers": "Retry-After",
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_COVER_LETTER_LENGTH = 1000
const CV_BUCKET = "cv ung tuyen"
const CV_LINK_EXPIRES_IN = 60 * 60 * 24 * 7
const TURNSTILE_ACTION = "submit_application"

const jsonResponse = (
  body: unknown,
  status: number,
  additionalHeaders: HeadersInit = {},
) =>
  Response.json(body, {
    status,
    headers: {
      ...corsHeaders,
      ...additionalHeaders,
    },
  })

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name)

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`)
  }

  return value
}

const readString = (formData: FormData, name: string) => {
  const value = formData.get(name)
  return typeof value === "string" ? value.trim() : ""
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    })
  }

  if (request.method !== "POST") {
    return jsonResponse(
      {
        success: false,
        code: "METHOD_NOT_ALLOWED",
        message: "Method not allowed",
      },
      405,
      {Allow: "POST"},
    )
  }

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? ""

  if (!contentType.startsWith("multipart/form-data")) {
    return jsonResponse(
      {
        success: false,
        code: "UNSUPPORTED_MEDIA_TYPE",
        message: "Content-Type must be multipart/form-data",
      },
      415,
    )
  }

  try {
    const formData = await request.formData()
    const firstname = readString(formData, "firstname")
    const lastname = readString(formData, "lastname")
    const email = readString(formData, "email")
    const positionId = readString(formData, "positionId")
    const coverletter = readString(formData, "coverletter")
    const turnstileToken = readString(formData, "turnstileToken")
    const cv = formData.get("cv")
    const fieldErrors: FieldErrors = {}

    if (!firstname) {
      fieldErrors.firstname = "Vui lòng nhập tên"
    }

    if (!lastname) {
      fieldErrors.lastname = "Vui lòng nhập họ"
    }

    if (!email) {
      fieldErrors.email = "Vui lòng nhập email"
    } else if (!EMAIL_PATTERN.test(email)) {
      fieldErrors.email = "Email không hợp lệ"
    }

    if (!positionId) {
      fieldErrors.positionId = "Vui lòng chọn vị trí ứng tuyển"
    } else if (!UUID_PATTERN.test(positionId)) {
      fieldErrors.positionId = "Vị trí ứng tuyển không hợp lệ"
    }

    if (!coverletter) {
      fieldErrors.coverletter = "Vui lòng nhập thư giới thiệu"
    } else if (coverletter.length > MAX_COVER_LETTER_LENGTH) {
      fieldErrors.coverletter =
        "Giới thiệu bản thân không được vượt quá 1000 ký tự"
    }

    if (!(cv instanceof File) || cv.size === 0) {
      fieldErrors.cv = "Vui lòng đính kèm CV"
    }

    if (Object.keys(fieldErrors).length > 0) {
      return jsonResponse(
        {
          success: false,
          code: "VALIDATION_ERROR",
          message: "Dữ liệu hồ sơ không hợp lệ",
          fieldErrors,
        },
        400,
      )
    }

    if (!turnstileToken) {
      return jsonResponse(
        {
          success: false,
          code: "CAPTCHA_REQUIRED",
          message: "Vui lòng xác nhận bạn không phải là robot",
        },
        400,
      )
    }

    if (turnstileToken.length > MAX_TURNSTILE_TOKEN_LENGTH) {
      return jsonResponse(
        {
          success: false,
          code: "CAPTCHA_INVALID",
          message: "Xác minh chống spam không hợp lệ. Vui lòng thử lại",
        },
        400,
      )
    }

    const turnstileSecretKey = Deno.env.get("TURNSTILE_SECRET_KEY")

    if (!turnstileSecretKey) {
      console.error("Missing TURNSTILE_SECRET_KEY")

      return jsonResponse(
        {
          success: false,
          code: "CAPTCHA_UNAVAILABLE",
          message: "Không thể xác minh chống spam. Vui lòng thử lại sau",
        },
        503,
      )
    }

    const clientIp = getClientIp(request.headers)
    const turnstileResult = await verifyTurnstileToken({
      token: turnstileToken,
      secretKey: turnstileSecretKey,
      remoteIp: clientIp,
      expectedAction: TURNSTILE_ACTION,
      expectedHostname: Deno.env.get("TURNSTILE_EXPECTED_HOSTNAME")?.trim() ||
        undefined,
    })

    if (!turnstileResult.success) {
      console.error("Turnstile verification failed:", {
        reason: turnstileResult.reason,
        errorCodes: turnstileResult.errorCodes,
      })

      const unavailable = turnstileResult.reason === "unavailable"

      return jsonResponse(
        {
          success: false,
          code: unavailable ? "CAPTCHA_UNAVAILABLE" : "CAPTCHA_INVALID",
          message: unavailable
            ? "Không thể xác minh chống spam. Vui lòng thử lại sau"
            : "Xác minh chống spam không hợp lệ. Vui lòng thử lại",
        },
        unavailable ? 503 : 400,
      )
    }

    const cvValidation = await validateCvFile(cv as File)

    if (!cvValidation.valid) {
      return jsonResponse(
        {
          success: false,
          code: cvValidation.code,
          message: cvValidation.message,
          fieldErrors: {
            cv: cvValidation.message,
          },
        },
        cvValidation.status,
      )
    }

    const supabase = createClient(
      requiredEnv("SUPABASE_URL"),
      requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    )
    const {data: position, error: positionError} = await supabase
      .from("positions")
      .select("id, title")
      .eq("id", positionId)
      .eq("is_active", true)
      .maybeSingle()

    if (positionError) {
      console.error("Failed to validate position:", positionError)

      return jsonResponse(
        {
          success: false,
          code: "POSITION_LOOKUP_FAILED",
          message: "Không thể kiểm tra vị trí ứng tuyển",
        },
        500,
      )
    }

    if (!position) {
      return jsonResponse(
        {
          success: false,
          code: "INVALID_POSITION",
          message: "Vị trí ứng tuyển không hợp lệ",
        },
        400,
      )
    }

    const rateLimitSalt = Deno.env.get("RATE_LIMIT_SALT")

    if (!rateLimitSalt) {
      console.error("Missing RATE_LIMIT_SALT")

      return jsonResponse(
        {
          success: false,
          code: "RATE_LIMIT_UNAVAILABLE",
          message: "Không thể kiểm tra giới hạn gửi hồ sơ. Vui lòng thử lại sau",
        },
        503,
      )
    }

    const rateLimitKey = await hashClientIp(clientIp, rateLimitSalt)
    const rateLimitResult = await consumeApplicationRateLimit(
      (functionName, parameters) => supabase.rpc(functionName, parameters),
      rateLimitKey,
    )

    if (!rateLimitResult.success) {
      console.error("Failed to consume application rate limit:", {
        error: rateLimitResult.error,
      })

      return jsonResponse(
        {
          success: false,
          code: "RATE_LIMIT_UNAVAILABLE",
          message: "Không thể kiểm tra giới hạn gửi hồ sơ. Vui lòng thử lại sau",
        },
        503,
      )
    }

    if (!rateLimitResult.allowed) {
      return jsonResponse(
        {
          success: false,
          code: "RATE_LIMITED",
          message: "Bạn đã gửi quá nhiều hồ sơ. Vui lòng thử lại sau",
          retryAfterSeconds: rateLimitResult.retryAfterSeconds,
        },
        429,
        {
          "Retry-After": String(rateLimitResult.retryAfterSeconds),
        },
      )
    }

    const persistenceResult = await persistApplication(
      {
        lastname,
        firstname,
        email,
        positionId,
        coverletter,
        cv: cv as File,
        extension: cvValidation.extension,
      },
      {
        upload: async (bucket, path, file, contentType) => {
          const {error} = await supabase.storage
            .from(bucket)
            .upload(path, file, {
              contentType,
              upsert: false,
            })

          return {error}
        },
        insert: async (application) => {
          const {data, error} = await supabase
            .from("applications")
            .insert(application)
            .select("id, created_at")
            .single()

          return {data, error}
        },
        remove: async (bucket, paths) => {
          const {error} = await supabase.storage.from(bucket).remove(paths)
          return {error}
        },
      },
    )

    if (!persistenceResult.success) {
      console.error("Failed to persist application:", persistenceResult)

      return jsonResponse(
        {
          success: false,
          code: persistenceResult.code,
          message: persistenceResult.message,
        },
        persistenceResult.status,
      )
    }

    const markEmailFailed = async (error: string) => {
      const {error: updateError} = await supabase
        .from("applications")
        .update({
          hr_email_status: "failed",
          hr_email_error: error,
          hr_email_id: null,
          hr_email_sent_at: null,
        })
        .eq("id", persistenceResult.applicationId)

      if (updateError) {
        console.error("Failed to mark HR email as failed:", updateError)
      }
    }

    const {data: cvLink, error: cvLinkError} = await supabase.storage
      .from(CV_BUCKET)
      .createSignedUrl(persistenceResult.cvPath, CV_LINK_EXPIRES_IN)

    if (cvLinkError) {
      console.error("Failed to create signed CV URL:", cvLinkError)
      await markEmailFailed(cvLinkError.message)

      return jsonResponse(
        {
          success: false,
          code: "CV_LINK_FAILED",
          message: "Không thể gửi hồ sơ. Vui lòng thử lại sau",
        },
        500,
      )
    }

    const emailResult = await sendHrApplicationEmail(
      {
        id: persistenceResult.applicationId,
        lastName: lastname,
        firstName: firstname,
        email,
        positionTitle: position.title,
        coverLetter: coverletter,
        createdAt: persistenceResult.createdAt,
        cvUrl: cvLink.signedUrl,
      },
      requiredEnv("RESEND_API_KEY"),
    )

    if (!emailResult.success) {
      console.error("Failed to send HR email:", emailResult)
      await markEmailFailed(emailResult.error)

      return jsonResponse(
        {
          success: false,
          code: "HR_EMAIL_FAILED",
          message: "Không thể gửi hồ sơ. Vui lòng thử lại sau",
        },
        502,
      )
    }

    const {error: acceptedUpdateError} = await supabase
      .from("applications")
      .update({
        hr_email_status: "accepted",
        hr_email_id: emailResult.emailId,
        hr_email_error: null,
        hr_email_sent_at: new Date().toISOString(),
      })
      .eq("id", persistenceResult.applicationId)

    if (acceptedUpdateError) {
      console.error(
        "HR email was accepted but status update failed:",
        acceptedUpdateError,
      )
    }

    return jsonResponse(
      {
        success: true,
        code: "APPLICATION_SUBMITTED",
        applicationId: persistenceResult.applicationId,
        hrEmailId: emailResult.emailId,
      },
      201,
    )
  } catch (error) {
    console.error("Failed to validate submission:", error)

    return jsonResponse(
      {
        success: false,
        code: "INVALID_FORM_DATA",
        message: "Dữ liệu hồ sơ không hợp lệ",
      },
      400,
    )
  }
})

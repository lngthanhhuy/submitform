import { createClient } from "@supabase/supabase-js"
import { sendHrApplicationEmail } from "../_shared/hr-email.ts"

type ApplicationRecord = {
  id: string
  last_name: string
  first_name: string
  email: string
  position_id: string
  cv_path: string
  cover_letter: string | null
  created_at: string
  submission_source?: "browser" | "edge_function"
}

type WebhookPayload = {
  type: "INSERT"
  table: "applications"
  schema: "public"
  record: ApplicationRecord
}

const CV_BUCKET = "cv ung tuyen"
const CV_LINK_EXPIRES_IN = 60 * 60 * 24 * 7

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name)

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`)
  }

  return value
}

const jsonResponse = (body: unknown, status = 200) =>
  Response.json(body, {status})

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({error: "Method not allowed"}, 405)
  }

  try {
    if (
      request.headers.get("x-webhook-secret") !==
        requiredEnv("WEBHOOK_SECRET")
    ) {
      return jsonResponse({error: "Unauthorized"}, 401)
    }

    const payload = await request.json() as WebhookPayload

    if (
      payload.type !== "INSERT" ||
      payload.table !== "applications" ||
      payload.schema !== "public" ||
      !payload.record
    ) {
      return jsonResponse({error: "Invalid webhook payload"}, 400)
    }

    if (payload.record.submission_source === "edge_function") {
      return jsonResponse({
        success: true,
        skipped: true,
        reason: "EDGE_FUNCTION_SUBMISSION",
      })
    }

    const supabase = createClient(
      requiredEnv("SUPABASE_URL"),
      requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    )
    const updateEmailStatus = async (
      values: Record<string, string | null>,
    ) => {
      const {error} = await supabase
        .from("applications")
        .update(values)
        .eq("id", payload.record.id)

      if (error) {
        console.error("Failed to update HR email status:", error)
      }

      return error
    }

    const pendingError = await updateEmailStatus({
      hr_email_status: "pending",
      hr_email_id: null,
      hr_email_error: null,
      hr_email_sent_at: null,
    })

    if (pendingError) {
      return jsonResponse(
        {success: false, code: "EMAIL_STATUS_UPDATE_FAILED"},
        500,
      )
    }

    const {data: position, error: positionError} = await supabase
      .from("positions")
      .select("title")
      .eq("id", payload.record.position_id)
      .single()

    if (positionError) {
      await updateEmailStatus({
        hr_email_status: "failed",
        hr_email_error: positionError.message,
      })
      return jsonResponse({success: false, code: "POSITION_LOOKUP_FAILED"}, 500)
    }

    const {data: cv, error: cvError} = await supabase.storage
      .from(CV_BUCKET)
      .createSignedUrl(payload.record.cv_path, CV_LINK_EXPIRES_IN)

    if (cvError) {
      await updateEmailStatus({
        hr_email_status: "failed",
        hr_email_error: cvError.message,
      })
      return jsonResponse({success: false, code: "CV_LINK_FAILED"}, 500)
    }

    const emailResult = await sendHrApplicationEmail(
      {
        id: payload.record.id,
        lastName: payload.record.last_name,
        firstName: payload.record.first_name,
        email: payload.record.email,
        positionTitle: position.title,
        coverLetter: payload.record.cover_letter,
        createdAt: payload.record.created_at,
        cvUrl: cv.signedUrl,
      },
      requiredEnv("RESEND_API_KEY"),
    )

    if (!emailResult.success) {
      await updateEmailStatus({
        hr_email_status: "failed",
        hr_email_error: emailResult.error,
        hr_email_id: null,
        hr_email_sent_at: null,
      })

      return jsonResponse(
        {
          success: false,
          code: "HR_EMAIL_FAILED",
          error: emailResult.error,
        },
        502,
      )
    }

    await updateEmailStatus({
      hr_email_status: "accepted",
      hr_email_id: emailResult.emailId,
      hr_email_error: null,
      hr_email_sent_at: new Date().toISOString(),
    })

    return jsonResponse({
      success: true,
      hrEmailId: emailResult.emailId,
    })
  } catch (error) {
    console.error("Failed to send application email:", error)

    return jsonResponse(
      {error: error instanceof Error ? error.message : "Unknown error"},
      500,
    )
  }
})

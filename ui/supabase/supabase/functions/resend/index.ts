import { createClient } from "npm:@supabase/supabase-js@2"

type ApplicationRecord = {
  id: string
  last_name: string
  first_name: string
  email: string
  position_id: string
  cv_path: string
  cover_letter: string | null
  created_at: string
}

type WebhookPayload = {
  type: "INSERT"
  table: "applications"
  schema: "public"
  record: ApplicationRecord
}

type Email = {
  to: string
  subject: string
  html: string
  replyTo: string
}

const HR_EMAIL = "luongthanhhuy.170604@gmail.com"
const EMAIL_FROM = "Careers <onboarding@resend.dev>"
const CV_BUCKET = "cv ung tuyen"
const CV_LINK_EXPIRES_IN = 60 * 60 * 24 * 7

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name)

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`)
  }

  return value
}

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")

const jsonResponse = (body: unknown, status = 200) =>
  Response.json(body, {status})

const sendEmail = async (email: Email) => {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requiredEnv("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [email.to],
      reply_to: email.replyTo,
      subject: email.subject,
      html: email.html,
    }),
  })
  const result = await response.json()

  if (!response.ok) {
    throw new Error(`Resend error: ${JSON.stringify(result)}`)
  }

  return result
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({error: "Method not allowed"}, 405)
  }

  try {
    const webhookSecret = requiredEnv("WEBHOOK_SECRET")

    if (request.headers.get("x-webhook-secret") !== webhookSecret) {
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

    const supabase = createClient(
      requiredEnv("SUPABASE_URL"),
      requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    )

    const {data: position, error: positionError} = await supabase
      .from("positions")
      .select("title")
      .eq("id", payload.record.position_id)
      .single()

    if (positionError) {
      throw positionError
    }

    const {data: cv, error: cvError} = await supabase.storage
      .from(CV_BUCKET)
      .createSignedUrl(payload.record.cv_path, CV_LINK_EXPIRES_IN)

    if (cvError) {
      throw cvError
    }

    const applicantName =
      `${payload.record.last_name} ${payload.record.first_name}`.trim()
    const submittedAt = new Intl.DateTimeFormat("vi-VN", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: "Asia/Ho_Chi_Minh",
    }).format(new Date(payload.record.created_at))
    const coverLetter = payload.record.cover_letter?.trim() || "Không có"

    const hrEmail = sendEmail({
      to: HR_EMAIL,
      replyTo: payload.record.email,
      subject: `[Hồ sơ mới] ${applicantName} - ${position.title}`,
      html: `
        <div style="margin:0;background:#f4f6f8;padding:32px 12px;font-family:Arial,sans-serif;color:#172033">
          <div style="max-width:680px;margin:auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
            <div style="background:#172033;padding:24px 28px;color:#fff">
              <div style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#b8c2d6">Tuyển dụng</div>
              <h1 style="font-size:24px;margin:8px 0 0">Hồ sơ ứng tuyển mới</h1>
            </div>
            <div style="padding:28px">
              <p style="margin-top:0">Một ứng viên vừa gửi hồ sơ qua website.</p>
              <table style="border-collapse:collapse;width:100%;margin:20px 0">
                <tr><td style="padding:11px;border-bottom:1px solid #e5e7eb;color:#64748b;width:150px">Ứng viên</td><td style="padding:11px;border-bottom:1px solid #e5e7eb;font-weight:600">${escapeHtml(applicantName)}</td></tr>
                <tr><td style="padding:11px;border-bottom:1px solid #e5e7eb;color:#64748b">Email</td><td style="padding:11px;border-bottom:1px solid #e5e7eb"><a href="mailto:${escapeHtml(payload.record.email)}">${escapeHtml(payload.record.email)}</a></td></tr>
                <tr><td style="padding:11px;border-bottom:1px solid #e5e7eb;color:#64748b">Vị trí</td><td style="padding:11px;border-bottom:1px solid #e5e7eb">${escapeHtml(position.title)}</td></tr>
                <tr><td style="padding:11px;border-bottom:1px solid #e5e7eb;color:#64748b">Thời gian</td><td style="padding:11px;border-bottom:1px solid #e5e7eb">${escapeHtml(submittedAt)}</td></tr>
              </table>
              <h2 style="font-size:17px;margin:24px 0 10px">Thư giới thiệu</h2>
              <div style="white-space:pre-wrap;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:16px">${escapeHtml(coverLetter)}</div>
              <p style="margin:26px 0 12px">
                <a href="${cv.signedUrl}" style="display:inline-block;background:#172033;color:#fff;text-decoration:none;padding:12px 20px;border-radius:7px;font-weight:600">Xem CV ứng viên</a>
              </p>
              <p style="font-size:12px;color:#64748b;margin-bottom:0">Link CV được bảo mật và hết hạn sau 7 ngày. Trả lời email này để liên hệ ứng viên.</p>
            </div>
          </div>
        </div>
      `,
    })

    const applicantEmail = sendEmail({
      to: payload.record.email,
      replyTo: HR_EMAIL,
      subject: `Xác nhận đã nhận hồ sơ - ${position.title}`,
      html: `
        <div style="margin:0;background:#f4f6f8;padding:32px 12px;font-family:Arial,sans-serif;color:#172033">
          <div style="max-width:620px;margin:auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
            <div style="background:#172033;padding:24px 28px;color:#fff">
              <div style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#b8c2d6">Tuyển dụng</div>
              <h1 style="font-size:24px;margin:8px 0 0">Hồ sơ đã được tiếp nhận</h1>
            </div>
            <div style="padding:28px">
              <p>Chào <strong>${escapeHtml(applicantName)}</strong>,</p>
              <p>Cảm ơn bạn đã ứng tuyển vị trí <strong>${escapeHtml(position.title)}</strong>. Hồ sơ của bạn đã được gửi thành công đến bộ phận tuyển dụng.</p>
              <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:22px 0">
                <div style="margin-bottom:8px"><strong>Mã hồ sơ:</strong> ${escapeHtml(payload.record.id)}</div>
                <div style="margin-bottom:8px"><strong>Vị trí:</strong> ${escapeHtml(position.title)}</div>
                <div><strong>Thời gian:</strong> ${escapeHtml(submittedAt)}</div>
              </div>
              <p>Bộ phận tuyển dụng sẽ liên hệ nếu hồ sơ phù hợp. Bạn có thể trả lời email này nếu cần bổ sung thông tin.</p>
              <p style="margin-bottom:0">Trân trọng,<br><strong>Bộ phận tuyển dụng</strong></p>
            </div>
          </div>
        </div>
      `,
    })

    const [hrResult, applicantResult] = await Promise.allSettled([
      hrEmail,
      applicantEmail,
    ])

    if (hrResult.status === "rejected") {
      throw hrResult.reason
    }

    return jsonResponse({
      success: true,
      hrEmailId: hrResult.value.id,
      applicantEmail:
        applicantResult.status === "fulfilled"
          ? {sent: true, id: applicantResult.value.id}
          : {sent: false, error: String(applicantResult.reason)},
    })
  } catch (error) {
    console.error("Failed to send application emails:", error)

    return jsonResponse(
      {error: error instanceof Error ? error.message : "Unknown error"},
      500,
    )
  }
})

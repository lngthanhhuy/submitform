export const HR_EMAIL = "luongthanhhuy.170604@gmail.com"
export const EMAIL_FROM = "Careers <onboarding@resend.dev>"
export const RESEND_TIMEOUT_MS = 10_000
export const RESEND_RETRY_DELAY_MS = 500

export type HrEmailApplication = {
  id: string
  lastName: string
  firstName: string
  email: string
  positionTitle: string
  coverLetter: string | null
  createdAt: string
  cvUrl: string
}

export type HrEmailResult =
  | {
    success: true
    emailId: string
    attempts: number
  }
  | {
    success: false
    error: string
    attempts: number
    status?: number
  }

export type HrEmailDependencies = {
  fetch: typeof fetch
  sleep: (milliseconds: number) => Promise<void>
  timeoutSignal: (milliseconds: number) => AbortSignal
}

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")

const formatSubmittedAt = (createdAt: string) =>
  new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(createdAt))

export const buildHrEmail = (application: HrEmailApplication) => {
  const applicantName =
    `${application.lastName} ${application.firstName}`.trim()
  const submittedAt = formatSubmittedAt(application.createdAt)
  const coverLetter = application.coverLetter?.trim() || "Không có"

  return {
    from: EMAIL_FROM,
    to: [HR_EMAIL],
    reply_to: application.email,
    subject:
      `[Hồ sơ mới] ${applicantName} - ${application.positionTitle}`,
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
              <tr><td style="padding:11px;border-bottom:1px solid #e5e7eb;color:#64748b">Email</td><td style="padding:11px;border-bottom:1px solid #e5e7eb"><a href="mailto:${escapeHtml(application.email)}">${escapeHtml(application.email)}</a></td></tr>
              <tr><td style="padding:11px;border-bottom:1px solid #e5e7eb;color:#64748b">Vị trí</td><td style="padding:11px;border-bottom:1px solid #e5e7eb">${escapeHtml(application.positionTitle)}</td></tr>
              <tr><td style="padding:11px;border-bottom:1px solid #e5e7eb;color:#64748b">Thời gian</td><td style="padding:11px;border-bottom:1px solid #e5e7eb">${escapeHtml(submittedAt)}</td></tr>
            </table>
            <h2 style="font-size:17px;margin:24px 0 10px">Thư giới thiệu</h2>
            <div style="white-space:pre-wrap;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:16px">${escapeHtml(coverLetter)}</div>
            <p style="margin:26px 0 12px">
              <a href="${escapeHtml(application.cvUrl)}" style="display:inline-block;background:#172033;color:#fff;text-decoration:none;padding:12px 20px;border-radius:7px;font-weight:600">Xem CV ứng viên</a>
            </p>
            <p style="font-size:12px;color:#64748b;margin-bottom:0">Link CV được bảo mật và hết hạn sau 7 ngày. Trả lời email này để liên hệ ứng viên.</p>
          </div>
        </div>
      </div>
    `,
  }
}

const shouldRetryStatus = (status: number) =>
  status === 408 || status === 429 || status >= 500

const responseError = async (response: Response) => {
  const text = await response.text()

  if (!text) {
    return `Resend returned HTTP ${response.status}`
  }

  try {
    return `Resend returned HTTP ${response.status}: ${
      JSON.stringify(JSON.parse(text))
    }`
  } catch {
    return `Resend returned HTTP ${response.status}: ${text}`
  }
}

const defaultDependencies: HrEmailDependencies = {
  fetch,
  sleep: (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
  timeoutSignal: (milliseconds) => AbortSignal.timeout(milliseconds),
}

export const sendHrApplicationEmail = async (
  application: HrEmailApplication,
  apiKey: string,
  dependencies: HrEmailDependencies = defaultDependencies,
): Promise<HrEmailResult> => {
  const email = buildHrEmail(application)
  const idempotencyKey = `hr-application/${application.id}`
  let lastError = "Unknown Resend error"
  let lastStatus: number | undefined

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await dependencies.fetch(
        "https://api.resend.com/emails",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify(email),
          signal: dependencies.timeoutSignal(RESEND_TIMEOUT_MS),
        },
      )

      if (response.ok) {
        const result = await response.json()

        if (
          typeof result === "object" &&
          result !== null &&
          "id" in result &&
          typeof result.id === "string"
        ) {
          return {success: true, emailId: result.id, attempts: attempt}
        }

        return {
          success: false,
          error: "Resend response did not include an email ID",
          attempts: attempt,
          status: response.status,
        }
      }

      lastStatus = response.status
      lastError = await responseError(response)

      if (!shouldRetryStatus(response.status)) {
        return {
          success: false,
          error: lastError,
          attempts: attempt,
          status: response.status,
        }
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }

    if (attempt === 1) {
      await dependencies.sleep(RESEND_RETRY_DELAY_MS)
    }
  }

  return {
    success: false,
    error: lastError,
    attempts: 2,
    status: lastStatus,
  }
}

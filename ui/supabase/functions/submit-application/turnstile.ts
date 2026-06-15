const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify"
const TURNSTILE_ALWAYS_PASS_TEST_SECRET =
  "1x0000000000000000000000000000000AA"

export const MAX_TURNSTILE_TOKEN_LENGTH = 2048
export const TURNSTILE_TIMEOUT_MS = 5_000

type TurnstileSiteverifyResponse = {
  success?: boolean
  hostname?: string
  action?: string
  ["error-codes"]?: string[]
}

export type TurnstileVerificationResult =
  | {success: true}
  | {
    success: false
    reason: "invalid" | "unavailable"
    errorCodes: string[]
  }

export type TurnstileDependencies = {
  fetch: typeof fetch
  timeoutSignal: (milliseconds: number) => AbortSignal
}

const defaultDependencies: TurnstileDependencies = {
  fetch,
  timeoutSignal: (milliseconds) => AbortSignal.timeout(milliseconds),
}

export const verifyTurnstileToken = async (
  input: {
    token: string
    secretKey: string
    remoteIp?: string
    expectedAction: string
    expectedHostname?: string
  },
  dependencies: TurnstileDependencies = defaultDependencies,
): Promise<TurnstileVerificationResult> => {
  const body = new URLSearchParams({
    secret: input.secretKey,
    response: input.token,
  })

  if (input.remoteIp && input.remoteIp !== "unknown") {
    body.set("remoteip", input.remoteIp)
  }

  let response: Response

  try {
    response = await dependencies.fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: dependencies.timeoutSignal(TURNSTILE_TIMEOUT_MS),
    })
  } catch {
    return {
      success: false,
      reason: "unavailable",
      errorCodes: ["siteverify-request-failed"],
    }
  }

  if (!response.ok) {
    return {
      success: false,
      reason: "unavailable",
      errorCodes: [`siteverify-http-${response.status}`],
    }
  }

  let result: TurnstileSiteverifyResponse

  try {
    result = await response.json() as TurnstileSiteverifyResponse
  } catch {
    return {
      success: false,
      reason: "unavailable",
      errorCodes: ["siteverify-invalid-response"],
    }
  }

  if (!result.success) {
    return {
      success: false,
      reason: "invalid",
      errorCodes: result["error-codes"] ?? ["siteverify-rejected"],
    }
  }

  const isAlwaysPassTestSecret =
    input.secretKey === TURNSTILE_ALWAYS_PASS_TEST_SECRET

  if (!isAlwaysPassTestSecret && result.action !== input.expectedAction) {
    return {
      success: false,
      reason: "invalid",
      errorCodes: ["action-mismatch"],
    }
  }

  if (
    input.expectedHostname &&
    result.hostname !== input.expectedHostname
  ) {
    return {
      success: false,
      reason: "invalid",
      errorCodes: ["hostname-mismatch"],
    }
  }

  return {success: true}
}

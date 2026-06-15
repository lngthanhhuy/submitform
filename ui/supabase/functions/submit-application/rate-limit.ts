export const APPLICATION_RATE_LIMIT = 5
export const APPLICATION_RATE_WINDOW_SECONDS = 15 * 60

type RpcError = {
  message: string
}

type RateLimitRpc = (
  functionName: string,
  parameters: {
    p_key_hash: string
    p_limit: number
    p_window_seconds: number
  },
) => PromiseLike<{
  data: unknown
  error: RpcError | null
}>

export type RateLimitResult =
  | {
    success: true
    allowed: boolean
    retryAfterSeconds: number
  }
  | {
    success: false
    error: string
  }

export const getClientIp = (headers: Headers) => {
  const cloudflareIp = headers.get("cf-connecting-ip")?.trim()

  if (cloudflareIp) {
    return cloudflareIp
  }

  const forwardedIp = headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim()

  return forwardedIp || "unknown"
}

export const hashClientIp = async (ip: string, salt: string) => {
  const bytes = new TextEncoder().encode(`${ip}:${salt}`)
  const digest = await crypto.subtle.digest("SHA-256", bytes)

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

export const consumeApplicationRateLimit = async (
  rpc: RateLimitRpc,
  keyHash: string,
): Promise<RateLimitResult> => {
  const {data, error} = await rpc("consume_application_rate_limit", {
    p_key_hash: keyHash,
    p_limit: APPLICATION_RATE_LIMIT,
    p_window_seconds: APPLICATION_RATE_WINDOW_SECONDS,
  })

  if (error) {
    return {
      success: false,
      error: error.message,
    }
  }

  const row = Array.isArray(data) ? data[0] : data

  if (
    !row ||
    typeof row !== "object" ||
    !("allowed" in row) ||
    typeof row.allowed !== "boolean" ||
    !("retry_after_seconds" in row) ||
    typeof row.retry_after_seconds !== "number"
  ) {
    return {
      success: false,
      error: "Invalid rate limit response",
    }
  }

  return {
    success: true,
    allowed: row.allowed,
    retryAfterSeconds: Math.max(0, Math.ceil(row.retry_after_seconds)),
  }
}

import { useEffect, useRef } from "react"

type TurnstileWidgetId = string

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string
      action: string
      callback: (token: string) => void
      "expired-callback": () => void
      "error-callback": () => void
    },
  ) => TurnstileWidgetId
  remove: (widgetId: TurnstileWidgetId) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

type TurnstileWidgetProps = {
  siteKey: string
  action: string
  resetKey: number
  onTokenChange: (token: string) => void
  onError: () => void
}

const SCRIPT_ID = "cloudflare-turnstile-script"
const SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"

let turnstilePromise: Promise<TurnstileApi> | null = null

const loadTurnstile = () => {
  if (window.turnstile) {
    return Promise.resolve(window.turnstile)
  }

  if (turnstilePromise) {
    return turnstilePromise
  }

  turnstilePromise = new Promise<TurnstileApi>((resolve, reject) => {
    const handleLoad = () => {
      if (window.turnstile) {
        resolve(window.turnstile)
      } else {
        reject(new Error("Turnstile API did not initialize"))
      }
    }

    const existingScript = document.getElementById(
      SCRIPT_ID,
    ) as HTMLScriptElement | null

    if (existingScript) {
      existingScript.addEventListener("load", handleLoad, {once: true})
      existingScript.addEventListener(
        "error",
        () => reject(new Error("Failed to load Turnstile")),
        {once: true},
      )
      return
    }

    const script = document.createElement("script")
    script.id = SCRIPT_ID
    script.src = SCRIPT_URL
    script.async = true
    script.defer = true
    script.addEventListener("load", handleLoad, {once: true})
    script.addEventListener(
      "error",
      () => reject(new Error("Failed to load Turnstile")),
      {once: true},
    )
    document.head.appendChild(script)
  }).catch((error) => {
    turnstilePromise = null
    throw error
  })

  return turnstilePromise
}

const TurnstileWidget = ({
  siteKey,
  action,
  resetKey,
  onTokenChange,
  onError,
}: TurnstileWidgetProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const onTokenChangeRef = useRef(onTokenChange)
  const onErrorRef = useRef(onError)

  useEffect(() => {
    onTokenChangeRef.current = onTokenChange
    onErrorRef.current = onError
  }, [onError, onTokenChange])

  useEffect(() => {
    const container = containerRef.current

    if (!container || !siteKey) {
      return
    }

    let active = true
    let widgetId: TurnstileWidgetId | null = null

    loadTurnstile()
      .then((turnstile) => {
        if (!active) {
          return
        }

        widgetId = turnstile.render(container, {
          sitekey: siteKey,
          action,
          callback: (token) => onTokenChangeRef.current(token),
          "expired-callback": () => onTokenChangeRef.current(""),
          "error-callback": () => {
            onTokenChangeRef.current("")
            onErrorRef.current()
          },
        })
      })
      .catch(() => {
        if (active) {
          onTokenChangeRef.current("")
          onErrorRef.current()
        }
      })

    return () => {
      active = false

      if (widgetId && window.turnstile) {
        window.turnstile.remove(widgetId)
      }
    }
  }, [action, resetKey, siteKey])

  return <div ref={containerRef} />
}

export default TurnstileWidget

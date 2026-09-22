"use client"

import { useCallback, useEffect, useState } from "react"

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message)
  }
}

async function parse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) {
    throw new ApiError(response.status, (body.error as string) ?? `Request failed (${response.status})`, body)
  }
  return body as T
}

export async function apiGet<T>(url: string): Promise<T> {
  return parse<T>(await fetch(url, { cache: "no-store" }))
}

export async function apiSend<T>(url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown): Promise<T> {
  return parse<T>(
    await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  )
}

export interface ApiState<T> {
  data: T | null
  error: string | null
  loading: boolean
  reload: () => Promise<void>
}

/** Small fetch-on-mount hook; every page reloads after a mutation so the
 * server stays the single source of truth for what the user may see. */
export function useApi<T>(url: string | null): ApiState<T> {
  const [result, setResult] = useState<{ url: string; data: T | null; error: string | null } | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!url) return
    let cancelled = false
    apiGet<T>(url)
      .then((data) => {
        if (!cancelled) setResult({ url, data, error: null })
      })
      .catch((caught: unknown) => {
        if (cancelled) return
        const message = caught instanceof Error ? caught.message : "Request failed"
        setResult((current) => ({ url, data: current?.url === url ? current.data : null, error: message }))
      })
    return () => {
      cancelled = true
    }
  }, [url, version])

  const reload = useCallback(async () => setVersion((current) => current + 1), [])
  const settled = result && result.url === url ? result : null

  return { data: settled?.data ?? null, error: settled?.error ?? null, loading: url !== null && settled === null, reload }
}

export function money(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amountMinor / 100)
}

export function relative(iso?: string): string {
  if (!iso) return "—"
  const deltaMs = new Date(iso).getTime() - Date.now()
  const minutes = Math.round(deltaMs / 60000)
  const abs = Math.abs(minutes)
  const format = (value: number, unit: Intl.RelativeTimeFormatUnit) =>
    new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(value, unit)
  if (abs < 60) return format(minutes, "minute")
  if (abs < 60 * 24) return format(Math.round(minutes / 60), "hour")
  return format(Math.round(minutes / (60 * 24)), "day")
}

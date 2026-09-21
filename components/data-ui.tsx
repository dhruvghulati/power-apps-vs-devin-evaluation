"use client"

import { AlertTriangle, CheckCircle2, Loader2, ShieldAlert } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

export function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card>
      <CardContent className="px-4 py-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
        {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
      </CardContent>
    </Card>
  )
}

export function Notice({ kind, children }: { kind: "error" | "denied" | "success" | "info"; children: React.ReactNode }) {
  const styles = {
    error: "border-destructive/40 bg-destructive/10 text-destructive",
    denied: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    info: "border-border bg-muted/50 text-muted-foreground",
  }[kind]
  const Icon = kind === "success" ? CheckCircle2 : kind === "denied" ? ShieldAlert : AlertTriangle
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${styles}`}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" /> {label}…
    </div>
  )
}

export function Section({ title, description, children, actions }: { title: string; description?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}

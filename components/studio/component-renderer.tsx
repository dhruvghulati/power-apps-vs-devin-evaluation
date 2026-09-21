"use client"

import { useMemo } from "react"
import { Database, Lock, ShieldCheck } from "lucide-react"
import { Notice } from "@/components/data-ui"
import { useSession } from "@/components/session-provider"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { money, useApi } from "@/lib/client/api"
import type { ComponentDefinition, ComponentInstance, MakerApp } from "./types"

interface RuntimeData {
  resource?: string
  rows: Record<string, unknown>[]
  kpis?: { label: string; value: number | string }[]
  piiMasked?: boolean
  system?: { name: string; status: string; latencyMs: number }
  entity?: { name: string; classification: string; fields: { name: string; type: string; pii: boolean }[] }
  error?: string
}

const PREFERRED_COLUMNS: Record<string, string[]> = {
  refunds: ["id", "customerName", "amountMinor", "status", "priority", "entity"],
  kyc: ["id", "customerName", "riskRating", "status", "slaDueAt", "entity"],
  payments: ["id", "refundId", "amountMinor", "status", "pspReference"],
  flags: ["key", "owner", "riskTier", "killed"],
  audit: ["seq", "eventType", "actorEmail", "resource", "outcome"],
}

const STATUS_TONE: Record<string, string> = {
  approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  settled: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  paid: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  clear: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  in_review: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  escalated: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  potential_match: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  rejected: "bg-red-500/15 text-red-700 dark:text-red-400",
  failed: "bg-red-500/15 text-red-700 dark:text-red-400",
  hit: "bg-red-500/15 text-red-700 dark:text-red-400",
  frozen: "bg-red-500/15 text-red-700 dark:text-red-400",
  high: "bg-red-500/15 text-red-700 dark:text-red-400",
}

export function formatCell(column: string, value: unknown, row: Record<string, unknown>): React.ReactNode {
  if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>
  if (typeof value === "boolean") return value ? "Yes" : "No"
  if (typeof value === "number" && /minor$/i.test(column)) return money(value, typeof row.currency === "string" ? row.currency : "USD")
  if (typeof value === "number" && /amount|balance|value/i.test(column)) return new Intl.NumberFormat("en-US", { style: "currency", currency: typeof row.currency === "string" ? row.currency : "EUR" }).format(value)
  if (typeof value === "string" && /at$/i.test(column) && !Number.isNaN(Date.parse(value))) return new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: /T/.test(value) ? "short" : undefined })
  if (typeof value === "string" && STATUS_TONE[value]) return <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${STATUS_TONE[value]}`}>{value.replace(/_/g, " ")}</span>
  if (typeof value === "object") return <span className="text-muted-foreground">{Array.isArray(value) ? `${value.length} items` : "{…}"}</span>
  return String(value)
}

export function dataUrlFor(app: Pick<MakerApp, "id">, instance: ComponentInstance): string | null {
  if (!["queue_table", "kpi_strip", "approval_panel", "record_form", "chart"].includes(instance.componentId)) return null
  const binding = typeof instance.props.binding === "string" ? instance.props.binding : ""
  if (binding.includes(".")) {
    const [system, entity] = binding.split(".")
    return `/api/datasources/${system}/${entity}`
  }
  const resource = typeof instance.props.resource === "string" ? instance.props.resource : ""
  return `/api/studio/apps/${app.id}/data${resource ? `?resource=${resource}` : ""}`
}

export function ComponentRenderer({
  app,
  instance,
  definition,
  compact = false,
}: {
  app: MakerApp
  instance: ComponentInstance
  definition?: ComponentDefinition
  compact?: boolean
}) {
  const { can } = useSession()
  const allowed = !definition || can(definition.requiredPermission)
  const url = allowed ? dataUrlFor(app, instance) : null
  const { data, error, loading } = useApi<RuntimeData>(url)

  const rows = useMemo(() => data?.rows ?? [], [data])
  const resourceKey = data?.resource ?? (typeof instance.props.resource === "string" ? instance.props.resource : app.resource)
  const entityFields = data?.entity?.fields
  const columns = useMemo(() => {
    const chosen = Array.isArray(instance.props.columns) ? (instance.props.columns as string[]) : []
    // Column picks from a previous binding are stale once the row shape changes; fall back to the schema.
    if (chosen.length && chosen.every((column) => rows.some((row) => column in row))) return chosen
    if (entityFields) return entityFields.map((field) => field.name).slice(0, compact ? 4 : 7)
    const preferred = PREFERRED_COLUMNS[resourceKey]?.filter((column) => rows.some((row) => column in row))
    if (preferred?.length) return preferred
    return Object.keys(rows[0] ?? {}).slice(0, compact ? 4 : 7)
  }, [instance.props.columns, resourceKey, rows, compact, entityFields])

  if (!allowed && definition)
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 px-3 py-4 text-xs text-amber-700 dark:text-amber-400">
        <Lock className="size-3.5" /> Hidden for you — needs <span className="font-mono">{definition.requiredPermission}</span>.
      </div>
    )

  if (error) return <Notice kind="denied">{error}</Notice>
  if (url && loading) return <div className="h-16 animate-pulse rounded-lg bg-muted/60" />

  const source = data?.entity ? (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
      <Database className="size-3" /> {data.system?.name} · {data.entity.name}
      <Badge variant="outline" className="text-[10px]">
        {data.entity.classification}
      </Badge>
      {data.piiMasked ? (
        <Badge variant="outline" className="text-[10px]">
          <ShieldCheck className="mr-1 size-3" /> PII masked
        </Badge>
      ) : null}
      <span>· {data.system?.latencyMs} ms</span>
    </div>
  ) : null

  switch (instance.componentId) {
    case "kpi_strip": {
      const kpis = data?.kpis ?? kpisFromRows(rows)
      return (
        <div className={`grid gap-2 ${compact ? "grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-4"}`}>
          {kpis.map((kpi) => (
            <div key={kpi.label} className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="text-[11px] text-muted-foreground">{kpi.label}</div>
              <div className="text-xl font-semibold tabular-nums">{kpi.value}</div>
            </div>
          ))}
        </div>
      )
    }
    case "chart": {
      const kpis = data?.kpis ?? kpisFromRows(rows)
      const max = Math.max(1, ...kpis.map((entry) => (typeof entry.value === "number" ? entry.value : 0)))
      return (
        <div className="space-y-2">
          {source}
          <div className="flex h-28 items-end gap-2">
            {kpis.map((kpi) => (
              <div key={kpi.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <div className="w-full rounded-t-md bg-primary/80 transition-all" style={{ height: `${Math.max(6, ((typeof kpi.value === "number" ? kpi.value : 0) / max) * 100)}%` }} />
                <div className="truncate text-[10px] text-muted-foreground" title={kpi.label}>
                  {kpi.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      )
    }
    case "document_uploader":
      return (
        <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
          Drop KYC evidence here · AES-256-GCM at rest · SHA-256 checksum · residency + retention applied · single-use download grants
        </div>
      )
    case "audit_trail":
      return <AuditTrail appId={app.id} compact={compact} />
    case "filter_bar":
      return (
        <div className="flex flex-wrap gap-2">
          {["Status", "Entity", "Priority", "Owner"].map((filter) => (
            <span key={filter} className="rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground">
              {filter} · any
            </span>
          ))}
          <span className="rounded-md border border-dashed border-border px-2 py-1 text-[11px] text-muted-foreground">Save as my view</span>
        </div>
      )
    case "record_form": {
      const fields = data?.entity?.fields ?? Object.keys(rows[0] ?? {}).slice(0, 6).map((name) => ({ name, type: "string", pii: false }))
      return (
        <div className="space-y-2">
          {source}
          <div className={`grid gap-2 ${compact ? "grid-cols-1" : "sm:grid-cols-2"}`}>
            {fields.slice(0, compact ? 4 : 8).map((field) => (
              <label key={field.name} className="space-y-1 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  {field.name}
                  {field.pii ? (
                    <Badge variant="outline" className="text-[9px]">
                      PII
                    </Badge>
                  ) : null}
                </span>
                <div className="h-8 rounded-md border border-input bg-background px-2 text-xs leading-8 text-foreground/70">
                  {rows[0] ? String(rows[0][field.name] ?? "") : field.type}
                </div>
              </label>
            ))}
          </div>
        </div>
      )
    }
    default: {
      const limit = instance.componentId === "approval_panel" ? 5 : Number(instance.props.pageSize) || (compact ? 4 : 10)
      if (rows.length === 0) return <div className="text-xs text-muted-foreground">No rows visible to you for {resourceKey}.</div>
      return (
        <div className="space-y-2">
          {source}
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((column) => (
                    <TableHead key={column} className="text-[11px]">
                      {column}
                    </TableHead>
                  ))}
                  {instance.componentId === "approval_panel" ? <TableHead className="text-[11px]">Decision</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, limit).map((row, index) => (
                  <TableRow key={`${index}:${String(row.id ?? row[data?.entity?.fields[0]?.name ?? "id"] ?? "")}`}>
                    {columns.map((column) => (
                      <TableCell key={column} className="text-xs">
                        {formatCell(column, row[column], row)}
                      </TableCell>
                    ))}
                    {instance.componentId === "approval_panel" ? (
                      <TableCell className="text-[11px] text-muted-foreground">maker-checker · MFA</TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )
    }
  }
}

function kpisFromRows(rows: Record<string, unknown>[]): { label: string; value: number }[] {
  const key = ["status", "stage", "sanctions", "risk", "variant", "record_class", "entity", "category", "channel", "scheme"].find((candidate) => rows.some((row) => typeof row[candidate] === "string"))
  if (!key) return [{ label: "Rows", value: rows.length }]
  const measure = ["refunds", "count", "events", "volume"].find((candidate) => rows.some((row) => typeof row[candidate] === "number"))
  const counts = new Map<string, number>()
  for (const row of rows) counts.set(String(row[key]), (counts.get(String(row[key])) ?? 0) + (measure ? Number(row[measure]) || 0 : 1))
  return [...counts.entries()].slice(0, 6).map(([label, value]) => ({ label, value }))
}

function AuditTrail({ appId, compact }: { appId: string; compact: boolean }) {
  const { data, error } = useApi<RuntimeData>(`/api/studio/apps/${appId}/data?resource=audit`)
  const rows = data?.rows ?? []
  if (error) return <Notice kind="denied">{error}</Notice>
  return (
    <ul className="divide-y divide-border rounded-lg border border-border text-xs">
      {rows.slice(0, compact ? 4 : 8).map((row, index) => (
        <li key={`${index}:${String(row.id ?? "")}`} className="flex items-center justify-between gap-2 px-3 py-1.5">
          <span className="truncate font-mono text-[11px]">{String(row.eventType ?? "")}</span>
          <span className="truncate text-muted-foreground">{String(row.actorEmail ?? row.actorId ?? "")}</span>
          <span className={`text-[11px] ${row.outcome === "deny" ? "text-amber-600" : "text-muted-foreground"}`}>{String(row.outcome ?? "")}</span>
        </li>
      ))}
      {rows.length === 0 ? <li className="px-3 py-2 text-muted-foreground">No audit events visible to you.</li> : null}
    </ul>
  )
}

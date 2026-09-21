"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Activity,
  Banknote,
  Blocks,
  FileClock,
  FlaskConical,
  IdCard,
  LayoutGrid,
  Plug,
  ShieldCheck,
  Wallet,
  Workflow,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useSession } from "@/components/session-provider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const NAV = [
  { href: "/", label: "Refunds", icon: Banknote, permission: "refund:read", group: "Operations" },
  { href: "/payments", label: "Payouts", icon: Wallet, permission: "payment:read", group: "Operations" },
  { href: "/kyc", label: "KYC", icon: IdCard, permission: "kyc:read", group: "Operations" },
  { href: "/feature-flags", label: "Flags & experiments", icon: FlaskConical, permission: "flag:read", group: "Operations" },
  { href: "/studio", label: "App studio", icon: LayoutGrid, permission: "app:read", group: "Build" },
  { href: "/studio/flows", label: "Flow builder", icon: Workflow, permission: "flow:read", group: "Build" },
  { href: "/data-connections", label: "Connections", icon: Plug, permission: "stream:read", group: "Build" },
  { href: "/data-streams", label: "Live streams", icon: Activity, permission: "stream:read", group: "Build" },
  { href: "/compliance", label: "Compliance", icon: ShieldCheck, permission: "compliance:read", group: "Govern" },
  { href: "/audit-logs", label: "Audit trail", icon: FileClock, permission: "audit:read", group: "Govern" },
  { href: "/admin", label: "Admin centre", icon: Blocks, permission: "platform:govern", group: "Govern" },
]

const GROUPS = ["Operations", "Build", "Govern"] as const

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { user, directory, can, switchUser, roleDefinitions, session } = useSession()

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-muted/30 p-4 lg:flex">
        <Link href="/" className="mb-6 block">
          <div className="text-sm font-semibold">Northwind Financial</div>
          <div className="text-xs text-muted-foreground">Internal operations platform</div>
        </Link>

        <nav className="flex-1 space-y-5">
          {GROUPS.map((group) => {
            const items = NAV.filter((item) => item.group === group && can(item.permission))
            if (items.length === 0) return null
            return (
              <div key={group}>
                <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group}</div>
                {items.map((item) => {
                  const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                        active ? "bg-primary/10 font-medium text-primary" : "text-foreground/80 hover:bg-muted"
                      }`}
                    >
                      <Icon className="size-4" />
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            )
          })}
        </nav>

        <div className="mt-6 space-y-2 rounded-lg border border-border bg-background p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Signed in as</div>
          <Select value={user?.id ?? ""} onValueChange={(value) => void switchUser(String(value))}>
            <SelectTrigger className="w-full" size="sm">
              <SelectValue placeholder="Select identity" />
            </SelectTrigger>
            <SelectContent>
              {(directory ?? []).map((identity) => (
                <SelectItem key={identity.id} value={identity.id}>
                  {identity.name} · {identity.roles.join(", ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex flex-wrap gap-1">
            {(roleDefinitions ?? []).map((role) => (
              <Badge key={role.id} variant="secondary" className="text-[10px]">
                {role.name}
              </Badge>
            ))}
          </div>
          <div className="text-[11px] text-muted-foreground">
            Scope {user?.scope ?? "—"} · MFA {user?.mfaEnrolled ? "enrolled" : "not enrolled"}
            {session ? ` · idle timeout ${session.idleTimeoutMinutes}m` : ""}
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 bg-background">{children}</main>
    </div>
  )
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description: string
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-6 py-5">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

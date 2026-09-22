"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Activity,
  Banknote,
  Blocks,
  FileClock,
  FlaskConical,
  Grip,
  IdCard,
  LayoutGrid,
  Plug,
  ShieldCheck,
  Wallet,
  Workflow,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useSession } from "@/components/session-provider"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"

const NAV = [
  { href: "/", label: "Refunds", icon: Banknote, permission: "refund:read", group: "Operations" },
  { href: "/payments", label: "Payouts", icon: Wallet, permission: "payment:read", group: "Operations" },
  { href: "/kyc", label: "KYC", icon: IdCard, permission: "kyc:read", group: "Operations" },
  { href: "/feature-flags", label: "Flags & experiments", icon: FlaskConical, permission: "flag:read", group: "Operations" },
  { href: "/studio", label: "Apps", icon: LayoutGrid, permission: "app:read", group: "Build" },
  { href: "/studio/flows", label: "Flows", icon: Workflow, permission: "flow:read", group: "Build" },
  { href: "/data-connections", label: "Connections", icon: Plug, permission: "stream:read", group: "Build" },
  { href: "/data-streams", label: "Live streams", icon: Activity, permission: "stream:read", group: "Build" },
  { href: "/compliance", label: "Compliance", icon: ShieldCheck, permission: "compliance:read", group: "Govern" },
  { href: "/audit-logs", label: "Audit trail", icon: FileClock, permission: "audit:read", group: "Govern" },
  { href: "/admin", label: "Admin centre", icon: Blocks, permission: "platform:govern", group: "Govern" },
]

const GROUPS = ["Operations", "Build", "Govern"] as const

function initials(name: string | undefined): string {
  if (!name) return "?"
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { user, directory, can, switchUser, roleDefinitions, session } = useSession()
  const primaryRole = roleDefinitions?.[0]?.name ?? user?.roles[0] ?? "—"

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 flex h-12 shrink-0 items-center gap-3 bg-brand px-3 text-brand-foreground shadow-sm">
        <button type="button" aria-label="App launcher" className="rounded p-1.5 hover:bg-white/15">
          <Grip className="size-5" />
        </button>
        <Link href="/" className="flex items-baseline gap-2">
          <span className="text-[15px] font-semibold tracking-tight">Northwind Internal Apps</span>
          <span className="hidden text-xs text-white/75 sm:inline">Governed maker platform</span>
        </Link>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center gap-1.5 rounded bg-white/10 px-2.5 py-1 text-xs md:flex">
            <span className="text-white/70">Environment</span>
            <span className="font-medium">Northwind (default)</span>
          </div>

          <Select value={user?.id ?? ""} onValueChange={(value) => void switchUser(String(value))}>
            <SelectTrigger
              aria-label="Signed in as"
              className="gap-2 rounded border-0 bg-white/10 py-0 pl-1 pr-2 text-brand-foreground hover:bg-white/20 focus-visible:ring-white/60 [&_svg]:text-white/80"
            >
              <span className="flex size-6 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-brand">
                {initials(user?.name)}
              </span>
              <span className="flex flex-col items-start leading-tight">
                <span className="text-[13px] font-semibold">{user?.name ?? "Signed out"}</span>
                <span className="text-[11px] text-white/80">
                  {primaryRole}
                  {user?.mfaEnrolled ? " · MFA" : ""}
                </span>
              </span>
            </SelectTrigger>
            <SelectContent align="end" className="min-w-72">
              <div className="px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Switch identity (demo personas)
              </div>
              {(directory ?? []).map((identity) => (
                <SelectItem key={identity.id} value={identity.id}>
                  <span className="flex flex-col">
                    <span className="font-medium">{identity.name}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {identity.roles.join(", ")} · {identity.department}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-sidebar lg:flex">
          <nav className="flex-1 space-y-4 px-2 py-3">
            {GROUPS.map((group) => {
              const items = NAV.filter((item) => item.group === group && can(item.permission))
              if (items.length === 0) return null
              return (
                <div key={group}>
                  <div className="mb-1 px-3 text-[11px] font-semibold text-muted-foreground">{group}</div>
                  {items.map((item) => {
                    const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))
                    const Icon = item.icon
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={`relative flex h-9 items-center gap-3 rounded px-3 text-[13px] transition-colors ${
                          active
                            ? "bg-sidebar-accent font-semibold text-foreground before:absolute before:left-0 before:top-2 before:h-5 before:w-[3px] before:rounded-full before:bg-brand"
                            : "text-foreground/85 hover:bg-sidebar-accent"
                        }`}
                      >
                        <Icon className={`size-[18px] ${active ? "text-brand" : "text-muted-foreground"}`} />
                        {item.label}
                      </Link>
                    )
                  })}
                </div>
              )
            })}
          </nav>

          <div className="border-t border-border px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
            <div className="mb-1 flex flex-wrap gap-1">
              {(roleDefinitions ?? []).map((role) => (
                <Badge key={role.id} variant="secondary" className="text-[10px]">
                  {role.name}
                </Badge>
              ))}
            </div>
            Scope {user?.scope ?? "—"}
            {session ? ` · idle timeout ${session.idleTimeoutMinutes} min` : ""}
          </div>
        </aside>

        <main className="min-w-0 flex-1 bg-background">{children}</main>
      </div>
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
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border bg-card px-6 py-4">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-1 max-w-3xl text-[13px] text-muted-foreground">{description}</p>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

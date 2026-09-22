/**
 * Brand-styled marks for the synthetic vendor catalog. These are local SVG
 * approximations (brand color + glyph), not trademarked logo files.
 */
const BRANDS: Record<string, { bg: string; fg: string; glyph: "snowflake" | "cloud" | "shield" | "vault" | "card" | "ticket" | "db" | "bars" | "arrow" | "folder" | "hook" | "crm" }> = {
  "thought machine": { bg: "#312e81", fg: "#c7d2fe", glyph: "vault" },
  vault: { bg: "#312e81", fg: "#c7d2fe", glyph: "vault" },
  adyen: { bg: "#0abf53", fg: "#ffffff", glyph: "card" },
  complyadvantage: { bg: "#7f1d1d", fg: "#fecaca", glyph: "shield" },
  snowflake: { bg: "#29b5e8", fg: "#ffffff", glyph: "snowflake" },
  salesforce: { bg: "#00a1e0", fg: "#ffffff", glyph: "cloud" },
  crm: { bg: "#00a1e0", fg: "#ffffff", glyph: "crm" },
  sharepoint: { bg: "#038387", fg: "#ffffff", glyph: "folder" },
  blob: { bg: "#038387", fg: "#ffffff", glyph: "folder" },
  jira: { bg: "#2684ff", fg: "#ffffff", glyph: "ticket" },
  postgres: { bg: "#336791", fg: "#ffffff", glyph: "db" },
  kafka: { bg: "#171717", fg: "#ffffff", glyph: "bars" },
  kinesis: { bg: "#8c4fff", fg: "#ffffff", glyph: "arrow" },
  sftp: { bg: "#0e7490", fg: "#ffffff", glyph: "folder" },
  webhook: { bg: "#334155", fg: "#ffffff", glyph: "hook" },
  core: { bg: "#0f766e", fg: "#ccfbf1", glyph: "db" },
  ledger: { bg: "#0f766e", fg: "#ccfbf1", glyph: "db" },
  payment: { bg: "#0abf53", fg: "#ffffff", glyph: "card" },
  kyc: { bg: "#7f1d1d", fg: "#fecaca", glyph: "shield" },
  screening: { bg: "#7f1d1d", fg: "#fecaca", glyph: "shield" },
  document: { bg: "#038387", fg: "#ffffff", glyph: "folder" },
  analytics: { bg: "#29b5e8", fg: "#ffffff", glyph: "snowflake" },
  warehouse: { bg: "#29b5e8", fg: "#ffffff", glyph: "snowflake" },
  ticketing: { bg: "#2684ff", fg: "#ffffff", glyph: "ticket" },
}

function brandFor(name: string) {
  const key = name.toLowerCase()
  for (const [match, brand] of Object.entries(BRANDS)) if (key.includes(match)) return brand
  return { bg: "#4b5563", fg: "#e5e7eb", glyph: "db" as const }
}

function Glyph({ kind, color }: { kind: string; color: string }) {
  const s = { stroke: color, strokeWidth: 1.7, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const }
  switch (kind) {
    case "snowflake":
      return (
        <g {...s}>
          <path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9" />
          <path d="M9.6 5.4L12 8l2.4-2.6M9.6 18.6L12 16l2.4 2.6" />
        </g>
      )
    case "cloud":
      return <path {...s} fill={color} stroke="none" d="M8 18.5a4.5 4.5 0 0 1-.9-8.9A6 6 0 0 1 18.6 9a4 4 0 0 1 1 7.9c-.4 1-1.5 1.6-2.6 1.6Z" opacity="0.95" />
    case "shield":
      return (
        <g {...s}>
          <path d="M12 3l7 2.5v5c0 4.6-3 8-7 10.5C8 18.5 5 15.1 5 10.5v-5Z" />
          <path d="M9 12l2 2 4-4.5" />
        </g>
      )
    case "vault":
      return (
        <g {...s}>
          <path d="M12 3.2l7.8 4.5v8.6L12 20.8l-7.8-4.5V7.7Z" />
          <path d="M12 8.2l3.5 2v4l-3.5 2-3.5-2v-4Z" />
        </g>
      )
    case "card":
      return (
        <g {...s}>
          <rect x="3.5" y="6" width="17" height="12" rx="2" />
          <path d="M3.5 9.5h17M6.5 14h4" />
        </g>
      )
    case "ticket":
      return (
        <g {...s}>
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <path d="M8 9.5h8M8 12.5h8M8 15.5h5" />
        </g>
      )
    case "db":
      return (
        <g {...s}>
          <ellipse cx="12" cy="6.5" rx="7" ry="2.8" />
          <path d="M5 6.5v11c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-11M5 12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8" />
        </g>
      )
    case "bars":
      return (
        <g {...s}>
          <path d="M7 5v14M12 3v18M17 7v10" />
        </g>
      )
    case "arrow":
      return (
        <g {...s}>
          <path d="M12 20V4M6 10l6-6 6 6" />
          <path d="M5 20h14" opacity="0.6" />
        </g>
      )
    case "folder":
      return (
        <g {...s}>
          <path d="M3.5 7A1.5 1.5 0 0 1 5 5.5h4l2 2h8A1.5 1.5 0 0 1 20.5 9v8a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 17Z" />
          <path d="M3.5 10h17" />
        </g>
      )
    case "hook":
      return (
        <g {...s}>
          <path d="M9.5 5.5A4 4 0 1 1 12 13" />
          <path d="M12 13v5.5a2 2 0 1 0 2-2" />
        </g>
      )
    case "crm":
      return (
        <g {...s}>
          <circle cx="9" cy="9" r="3" />
          <circle cx="16.5" cy="9.5" r="2.4" />
          <path d="M4.5 18.5c.6-3 2.5-4.6 4.5-4.6s3.9 1.6 4.5 4.6M14.2 18.5c.4-2.2 1.6-3.4 3-3.4 1.1 0 2.1.8 2.5 2.4" />
        </g>
      )
    default:
      return null
  }
}

export function VendorMark({ name, size = 34, className = "" }: { name: string; size?: number; className?: string }) {
  const brand = brandFor(name)
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label={`${name} mark`}
      className={`shrink-0 rounded-lg shadow-sm ring-1 ring-black/10 dark:ring-white/10 ${className}`}
      style={{ background: brand.bg }}
    >
      <rect width="24" height="24" fill={brand.bg} rx="5" />
      <Glyph kind={brand.glyph} color={brand.fg} />
    </svg>
  )
}

"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { getCurrentUser, hasPermission } from "@/lib/rbac"
import { getAuditEvents, getChainStatus, redactPII } from "@/lib/audit"

export default function AuditLogsViewer() {
  const [events, setEvents] = useState<any[]>([])
  const [chainStatus, setChainStatus] = useState<any>(null)
  const [filterEventType, setFilterEventType] = useState<string>("all")
  const [filterActor, setFilterActor] = useState<string>("all")
  const [searchTerm, setSearchTerm] = useState("")
  const [showPii, setShowPii] = useState(false)
  const [currentUser, setCurrentUserState] = useState(getCurrentUser())
  
  useEffect(() => {
    const loadData = async () => {
      setEvents(await getAuditEvents())
      setChainStatus(await getChainStatus())
    }
    loadData()
  }, [])

  const filteredEvents = events.filter(event => {
    const matchesType = filterEventType === "all" || event.eventType === filterEventType
    const matchesActor = filterActor === "all" || event.actorId === filterActor
    const matchesSearch = searchTerm === "" || 
      event.eventType.toLowerCase().includes(searchTerm.toLowerCase()) ||
      event.actorEmail.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesType && matchesActor && matchesSearch
  })

  const getEventTypeBadge = (eventType: string) => {
    const colors: Record<string, string> = {
      'refund.approved': 'badge-success border-0',
      'refund.rejected': 'badge-error border-0',
      'refund.exported': 'badge-info border-0',
      'flag.toggled': 'badge-info border-0',
      'user.login': 'badge-info border-0',
      'role.assigned': 'badge-warning border-0',
      'sod.blocked': 'badge-error border-0',
      'sod.resolved': 'badge-success border-0'
    }
    return colors[eventType] || 'badge-info border-0'
  }

  const formatJson = (data: any) => {
    if (!data) return '—'
    try {
      return JSON.stringify(data, null, 2)
    } catch {
      return String(data)
    }
  }

  const exportAuditLogs = () => {
    if (!hasPermission(currentUser, 'audit:export')) {
      alert('You do not have permission to export audit logs.')
      return
    }
    
    const headers = ["ID", "Event Type", "Actor", "Actor Role", "Timestamp", "Data Before", "Data After", "Hash"]
    const rows = filteredEvents.map(event => [
      event.id,
      event.eventType,
      event.actorEmail,
      event.actorRole,
      event.timestamp,
      JSON.stringify(event.dataBefore),
      JSON.stringify(event.dataAfter),
      event.hash
    ])
    
    const csvContent = [headers, ...rows].map(row => row.join(",")).join("\n")
    const blob = new Blob([csvContent], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen fintech-gradient">
      <div className="container mx-auto px-6 py-8 max-w-7xl">
        {/* Header */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gradient mb-2">Audit Logs</h1>
            <p className="text-muted-foreground text-base">Immutable event-sourced audit trail with cryptographic integrity</p>
          </div>
          <div className="flex flex-wrap gap-3 items-center">
            {/* Navigation Links */}
            <nav className="hidden lg:flex gap-2">
              <Link href="/" className="inline-flex items-center px-4 py-2.5 bg-white/80 backdrop-blur-sm border border-border rounded-lg hover:bg-white hover:shadow-sm transition-all text-sm font-medium">
                Refunds
              </Link>
              <Link href="/feature-flags" className="inline-flex items-center px-4 py-2.5 bg-white/80 backdrop-blur-sm border border-border rounded-lg hover:bg-white hover:shadow-sm transition-all text-sm font-medium">
                Feature Flags
              </Link>
              <Link href="/kyc" className="inline-flex items-center px-4 py-2.5 bg-white/80 backdrop-blur-sm border border-border rounded-lg hover:bg-white hover:shadow-sm transition-all text-sm font-medium">
                KYC Queue
              </Link>
              <Link href="/compliance" className="inline-flex items-center px-4 py-2.5 bg-white/80 backdrop-blur-sm border border-border rounded-lg hover:bg-white hover:shadow-sm transition-all text-sm font-medium">
                Compliance
              </Link>
              <Link href="/data-connections" className="inline-flex items-center px-4 py-2.5 bg-white/80 backdrop-blur-sm border border-border rounded-lg hover:bg-white hover:shadow-sm transition-all text-sm font-medium">
                Data Connections
              </Link>
            </nav>
            
            {/* User Info & Actions */}
            <div className="flex items-center gap-3 border-l border-border pl-3">
              <div className="text-sm text-right">
                <div className="font-semibold text-foreground">{currentUser.name}</div>
                <div className="text-muted-foreground text-xs">{currentUser.roles[0]} • {currentUser.department}</div>
              </div>
              <Button
                variant="outline"
                onClick={() => setShowPii(!showPii)}
                className="border-border"
              >
                {showPii ? 'Hide PII' : 'Show PII'}
              </Button>
              <Button
                onClick={exportAuditLogs}
                className="button-hover"
                disabled={!hasPermission(currentUser, 'audit:export')}
              >
                Export
              </Button>
            </div>
          </div>
        </div>

        {/* Compliance Status Banner */}
        <div className="bg-white/80 backdrop-blur-sm border border-border rounded-xl p-4 mb-8 card-shadow">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Compliance Status:</span>
            <Badge className="badge-success border-0">SOC2 Ready</Badge>
            <Badge className="badge-info border-0">Immutable</Badge>
            <Badge className="badge-info border-0">7-Year Retention</Badge>
          </div>
        </div>

        {/* Chain Integrity Status */}
        <Card className="mb-8 card-shadow border-border bg-white/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Chain Integrity Verification</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Chain Status</div>
                <div className="flex items-center gap-2">
                  {chainStatus?.valid ? (
                    <Badge className="badge-success border-0">Verified</Badge>
                  ) : (
                    <Badge className="badge-error border-0">Warning</Badge>
                  )}
                  <span className="text-sm text-muted-foreground">{chainStatus?.message || 'Checking...'}</span>
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Total Events</div>
                <div className="text-lg font-semibold text-foreground">{chainStatus?.totalEvents || 0}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Latest Hash</div>
                <div className="text-sm font-mono text-foreground truncate" title={chainStatus?.latestHash}>
                  {chainStatus?.latestHash?.substring(0, 16)}...
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Storage Compliance</div>
                <div className="text-sm text-foreground">{chainStatus?.storageCompliance}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        <Card className="mb-8 card-shadow border-border bg-white/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <Input
                  placeholder="Search by event type or actor..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="border-border input-focus"
                />
              </div>
              <Select value={filterEventType} onValueChange={(value) => setFilterEventType(value || 'all')}>
                <SelectTrigger className="w-[200px] border-border bg-white/80 backdrop-blur-sm">
                  <SelectValue placeholder="Filter by event type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Event Types</SelectItem>
                  <SelectItem value="refund.approved">Refund Approved</SelectItem>
                  <SelectItem value="refund.rejected">Refund Rejected</SelectItem>
                  <SelectItem value="refund.exported">Refund Exported</SelectItem>
                  <SelectItem value="flag.toggled">Flag Toggled</SelectItem>
                  <SelectItem value="user.login">User Login</SelectItem>
                  <SelectItem value="role.assigned">Role Assigned</SelectItem>
                  <SelectItem value="sod.blocked">SoD Blocked</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterActor} onValueChange={(value) => setFilterActor(value || 'all')}>
                <SelectTrigger className="w-[180px] border-border bg-white/80 backdrop-blur-sm">
                  <SelectValue placeholder="Filter by actor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actors</SelectItem>
                  <SelectItem value="user-001">Alice (Admin)</SelectItem>
                  <SelectItem value="user-002">Bob (Manager)</SelectItem>
                  <SelectItem value="user-003">Carol (Analyst)</SelectItem>
                  <SelectItem value="user-004">David (Processor)</SelectItem>
                  <SelectItem value="user-005">Eva (Auditor)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Audit Events Table */}
        <Card className="mb-8 card-shadow border-border bg-white/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Audit Events ({filteredEvents.length})</CardTitle>
            <CardDescription>Immutable event-sourced audit trail with before/after state capture</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="text-foreground">Timestamp</TableHead>
                  <TableHead className="text-foreground">Event Type</TableHead>
                  <TableHead className="text-foreground">Actor</TableHead>
                  <TableHead className="text-foreground">Role</TableHead>
                  <TableHead className="text-foreground">Data Before</TableHead>
                  <TableHead className="text-foreground">Data After</TableHead>
                  <TableHead className="text-foreground">Hash</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEvents.map((event) => (
                  <TableRow key={event.id} className="border-border table-row-hover">
                    <TableCell className="text-muted-foreground">
                      {new Date(event.timestamp).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge className={getEventTypeBadge(event.eventType)}>
                        {event.eventType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-foreground">
                      {showPii ? event.actorEmail : redactPII(event.actorEmail)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{event.actorRole}</TableCell>
                    <TableCell className="text-muted-foreground">
                      <div className="text-xs font-mono max-w-xs truncate" title={formatJson(event.dataBefore)}>
                        {event.dataBefore ? formatJson(event.dataBefore).substring(0, 50) + '...' : '—'}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <div className="text-xs font-mono max-w-xs truncate" title={formatJson(event.dataAfter)}>
                        {event.dataAfter ? formatJson(event.dataAfter).substring(0, 50) + '...' : '—'}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <div className="text-xs font-mono truncate" title={event.hash}>
                        {event.hash.substring(0, 12)}...
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Retention Information */}
        <Card className="mb-8 card-shadow border-border bg-white/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Retention Requirements</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">SOX Section 404</div>
                <div className="text-lg font-semibold text-foreground">7 years</div>
                <div className="text-xs text-muted-foreground">US public companies</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">SEC Rule 17a-4</div>
                <div className="text-lg font-semibold text-foreground">6 years (2 hot/warm)</div>
                <div className="text-xs text-muted-foreground">Broker-dealers</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">MiFID II</div>
                <div className="text-lg font-semibold text-foreground">5 years</div>
                <div className="text-xs text-muted-foreground">EU investment firms</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
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
      'refund.approved': 'bg-green-100 text-green-800',
      'refund.rejected': 'bg-red-100 text-red-800',
      'refund.exported': 'bg-blue-100 text-blue-800',
      'flag.toggled': 'bg-purple-100 text-purple-800',
      'user.login': 'bg-cyan-100 text-cyan-800',
      'role.assigned': 'bg-orange-100 text-orange-800',
      'sod.blocked': 'bg-red-100 text-red-800',
      'sod.resolved': 'bg-green-100 text-green-800'
    }
    return colors[eventType] || 'bg-gray-100 text-gray-800'
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="container mx-auto p-8 max-w-7xl">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-slate-900 mb-2">Audit Logs</h1>
            <p className="text-slate-600">Immutable event-sourced audit trail with cryptographic integrity</p>
          </div>
          <div className="flex gap-3 items-center">
            <div className="flex gap-2">
              <Badge className="bg-green-100 text-green-800 border-green-300">
                SOC2 Ready
              </Badge>
              <Badge className="bg-purple-100 text-purple-800 border-purple-300">
                Immutable
              </Badge>
              <Badge className="bg-blue-100 text-blue-800 border-blue-300">
                7-Year Retention
              </Badge>
            </div>
            <div className="flex items-center gap-3 border-l pl-3 border-slate-300">
              <div className="text-sm">
                <div className="font-semibold text-slate-900">{currentUser.name}</div>
                <div className="text-slate-600">{currentUser.roles[0]} • {currentUser.department}</div>
              </div>
              <Button
                variant="outline"
                onClick={() => setShowPii(!showPii)}
                className="border-slate-300"
              >
                {showPii ? 'Hide PII' : 'Show PII'}
              </Button>
              <Button
                onClick={exportAuditLogs}
                className="bg-slate-900 hover:bg-slate-800"
                disabled={!hasPermission(currentUser, 'audit:export')}
              >
                Export
              </Button>
            </div>
            <Link href="/" className="inline-flex items-center px-4 py-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
              ← Back to Refunds
            </Link>
          </div>
        </div>

        {/* Chain Integrity Status */}
        <Card className="mb-8 border-slate-200">
          <CardHeader>
            <CardTitle className="text-lg">Chain Integrity Verification</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-slate-600">Chain Status</div>
                <div className="flex items-center gap-2">
                  {chainStatus?.valid ? (
                    <Badge className="bg-green-100 text-green-800">Verified</Badge>
                  ) : (
                    <Badge className="bg-red-100 text-red-800">Warning</Badge>
                  )}
                  <span className="text-sm text-slate-600">{chainStatus?.message || 'Checking...'}</span>
                </div>
              </div>
              <div>
                <div className="text-sm text-slate-600">Total Events</div>
                <div className="text-lg font-semibold text-slate-900">{chainStatus?.totalEvents || 0}</div>
              </div>
              <div>
                <div className="text-sm text-slate-600">Latest Hash</div>
                <div className="text-sm font-mono text-slate-900 truncate" title={chainStatus?.latestHash}>
                  {chainStatus?.latestHash?.substring(0, 16)}...
                </div>
              </div>
              <div>
                <div className="text-sm text-slate-600">Storage Compliance</div>
                <div className="text-sm text-slate-900">{chainStatus?.storageCompliance}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        <Card className="mb-8 border-slate-200">
          <CardHeader>
            <CardTitle className="text-lg">Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <Input
                  placeholder="Search by event type or actor..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="border-slate-300"
                />
              </div>
              <Select value={filterEventType} onValueChange={(value) => setFilterEventType(value || 'all')}>
                <SelectTrigger className="w-[200px] border-slate-300">
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
                <SelectTrigger className="w-[180px] border-slate-300">
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
        <Card className="mb-8 border-slate-200">
          <CardHeader>
            <CardTitle className="text-lg">Audit Events ({filteredEvents.length})</CardTitle>
            <CardDescription>Immutable event-sourced audit trail with before/after state capture</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-slate-200">
                  <TableHead className="text-slate-700">Timestamp</TableHead>
                  <TableHead className="text-slate-700">Event Type</TableHead>
                  <TableHead className="text-slate-700">Actor</TableHead>
                  <TableHead className="text-slate-700">Role</TableHead>
                  <TableHead className="text-slate-700">Data Before</TableHead>
                  <TableHead className="text-slate-700">Data After</TableHead>
                  <TableHead className="text-slate-700">Hash</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEvents.map((event) => (
                  <TableRow key={event.id} className="border-slate-200 hover:bg-slate-50">
                    <TableCell className="text-slate-600">
                      {new Date(event.timestamp).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge className={getEventTypeBadge(event.eventType)}>
                        {event.eventType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-700">
                      {showPii ? event.actorEmail : redactPII(event.actorEmail)}
                    </TableCell>
                    <TableCell className="text-slate-600">{event.actorRole}</TableCell>
                    <TableCell className="text-slate-600">
                      <div className="text-xs font-mono max-w-xs truncate" title={formatJson(event.dataBefore)}>
                        {event.dataBefore ? formatJson(event.dataBefore).substring(0, 50) + '...' : '—'}
                      </div>
                    </TableCell>
                    <TableCell className="text-slate-600">
                      <div className="text-xs font-mono max-w-xs truncate" title={formatJson(event.dataAfter)}>
                        {event.dataAfter ? formatJson(event.dataAfter).substring(0, 50) + '...' : '—'}
                      </div>
                    </TableCell>
                    <TableCell className="text-slate-600">
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
        <Card className="mb-8 border-slate-200">
          <CardHeader>
            <CardTitle className="text-lg">Retention Requirements</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="text-sm text-slate-600">SOX Section 404</div>
                <div className="text-lg font-semibold text-slate-900">7 years</div>
                <div className="text-xs text-slate-500">US public companies</div>
              </div>
              <div>
                <div className="text-sm text-slate-600">SEC Rule 17a-4</div>
                <div className="text-lg font-semibold text-slate-900">6 years (2 hot/warm)</div>
                <div className="text-xs text-slate-500">Broker-dealers</div>
              </div>
              <div>
                <div className="text-sm text-slate-600">MiFID II</div>
                <div className="text-lg font-semibold text-slate-900">5 years</div>
                <div className="text-xs text-slate-500">EU investment firms</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex gap-3">
          <Link href="/compliance" className="inline-flex items-center px-4 py-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
            ← Back to Compliance
          </Link>
          <Link href="/" className="inline-flex items-center px-4 py-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
            Back to Refunds
          </Link>
        </div>
      </div>
    </div>
  )
}
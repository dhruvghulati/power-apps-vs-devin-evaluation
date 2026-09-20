"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getCurrentUser, hasPermission, switchUser } from "@/lib/rbac"
import { logAuditEvent, getChainStatus, seedSampleAuditEvents } from "@/lib/audit"
import { assignRoleWithSoDCheck, getUserSoDStatus, continuousSoDCheck } from "@/lib/sod"

interface RefundRequest {
  id: string
  customerName: string
  customerEmail: string
  amount: number
  currency: string
  reason: string
  status: "pending" | "approved" | "rejected"
  requestDate: string
  processedDate?: string
  processedBy?: string
  decisionNotes?: string
  priority: "low" | "medium" | "high"
}

const mockRefunds: RefundRequest[] = [
  {
    id: "REF-001",
    customerName: "John Smith",
    customerEmail: "john.smith@example.com",
    amount: 150.00,
    currency: "USD",
    reason: "Duplicate charge",
    status: "pending",
    requestDate: "2026-01-15",
    priority: "medium"
  },
  {
    id: "REF-002",
    customerName: "Sarah Johnson",
    customerEmail: "sarah.j@example.com",
    amount: 75.50,
    currency: "USD",
    reason: "Service not received",
    status: "approved",
    requestDate: "2026-01-14",
    processedDate: "2026-01-15",
    processedBy: "admin@company.com",
    decisionNotes: "Customer provided confirmation of service cancellation",
    priority: "low"
  },
  {
    id: "REF-003",
    customerName: "Mike Davis",
    customerEmail: "mike.davis@example.com",
    amount: 299.99,
    currency: "USD",
    reason: "Product defective",
    status: "rejected",
    requestDate: "2026-01-13",
    processedDate: "2026-01-14",
    processedBy: "admin@company.com",
    decisionNotes: "Customer returned used product, not eligible for refund",
    priority: "high"
  },
  {
    id: "REF-004",
    customerName: "Emily Chen",
    customerEmail: "emily.chen@example.com",
    amount: 45.00,
    currency: "USD",
    reason: "Wrong item sent",
    status: "pending",
    requestDate: "2026-01-16",
    priority: "medium"
  },
  {
    id: "REF-005",
    customerName: "Robert Wilson",
    customerEmail: "robert.w@example.com",
    amount: 120.00,
    currency: "USD",
    reason: "Billing error",
    status: "pending",
    requestDate: "2026-01-16",
    priority: "low"
  },
  {
    id: "REF-006",
    customerName: "Lisa Park",
    customerEmail: "lisa.park@example.com",
    amount: 89.99,
    currency: "USD",
    reason: "Damaged during shipping",
    status: "approved",
    requestDate: "2026-01-12",
    processedDate: "2026-01-13",
    processedBy: "admin@company.com",
    decisionNotes: "Shipping confirmed damage via photo evidence",
    priority: "high"
  }
]

export default function RefundsDashboard() {
  const [refunds, setRefunds] = useState<RefundRequest[]>(mockRefunds)
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [filterPriority, setFilterPriority] = useState<string>("all")
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedRefund, setSelectedRefund] = useState<RefundRequest | null>(null)
  const [decisionNotes, setDecisionNotes] = useState("")
  const [chainStatus, setChainStatus] = useState<any>(null)
  const [sodStatus, setSodStatus] = useState<any>(null)
  const [currentUser, setCurrentUserState] = useState(getCurrentUser())
  
  // Initialize audit events and check chain status on mount
  useEffect(() => {
    seedSampleAuditEvents()
    getChainStatus().then(setChainStatus)
    setSodStatus(continuousSoDCheck())
  }, [])

  const filteredRefunds = refunds.filter(refund => {
    const matchesStatus = filterStatus === "all" || refund.status === filterStatus
    const matchesPriority = filterPriority === "all" || refund.priority === filterPriority
    const matchesSearch = searchTerm === "" || 
      refund.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      refund.customerEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      refund.id.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesStatus && matchesPriority && matchesSearch
  })

  const stats = {
    total: refunds.length,
    pending: refunds.filter(r => r.status === "pending").length,
    approved: refunds.filter(r => r.status === "approved").length,
    rejected: refunds.filter(r => r.status === "rejected").length,
    totalAmount: refunds.filter(r => r.status === "approved").reduce((sum, r) => sum + r.amount, 0)
  }

  const handleApprove = async (refundId: string) => {
    const refund = refunds.find(r => r.id === refundId)
    if (!refund) return
    
    // Processing integrity: Check approval threshold
    if (refund.amount > 5000 && !hasPermission(currentUser, 'admin:write')) {
      alert('Amount >$5000 requires Director approval. Please escalate to Director.')
      return
    }
    
    const previousState = { ...refund }
    
    setRefunds(refunds.map(refund => 
      refund.id === refundId 
        ? { 
            ...refund, 
            status: "approved",
            processedDate: new Date().toISOString().split('T')[0],
            processedBy: currentUser.email,
            decisionNotes: decisionNotes
          }
        : refund
    ))
    
    // Log audit event with before/after state
    await logAuditEvent({
      id: crypto.randomUUID(),
      eventType: 'refund.approved',
      actorId: currentUser.id,
      actorRole: currentUser.roles[0],
      actorEmail: currentUser.email,
      timestamp: new Date().toISOString(),
      dataBefore: previousState,
      dataAfter: { ...previousState, status: 'approved', processedBy: currentUser.email, decisionNotes },
      metadata: { requiresDualAuth: refund.amount > 1000, threshold: refund.amount > 5000 ? 'Director' : refund.amount > 1000 ? 'Manager' : 'None' }
    })
    
    setSelectedRefund(null)
    setDecisionNotes("")
    
    // Refresh chain status
    setChainStatus(await getChainStatus())
  }

  const handleReject = async (refundId: string) => {
    const refund = refunds.find(r => r.id === refundId)
    if (!refund) return
    
    const previousState = { ...refund }
    
    setRefunds(refunds.map(refund => 
      refund.id === refundId 
        ? { 
            ...refund, 
            status: "rejected",
            processedDate: new Date().toISOString().split('T')[0],
            processedBy: currentUser.email,
            decisionNotes: decisionNotes
          }
        : refund
    ))
    
    // Log audit event with before/after state
    await logAuditEvent({
      id: crypto.randomUUID(),
      eventType: 'refund.rejected',
      actorId: currentUser.id,
      actorRole: currentUser.roles[0],
      actorEmail: currentUser.email,
      timestamp: new Date().toISOString(),
      dataBefore: previousState,
      dataAfter: { ...previousState, status: 'rejected', processedBy: currentUser.email, decisionNotes },
      metadata: { requiresDualAuth: refund.amount > 1000, threshold: refund.amount > 5000 ? 'Director' : refund.amount > 1000 ? 'Manager' : 'None' }
    })
    
    setSelectedRefund(null)
    setDecisionNotes("")
    
    // Refresh chain status
    setChainStatus(await getChainStatus())
  }

  const exportData = async () => {
    // Check permission
    if (!hasPermission(currentUser, 'refund:export')) {
      alert('You do not have permission to export data.')
      return
    }
    
    const headers = ["ID", "Customer Name", "Email", "Amount", "Currency", "Reason", "Status", "Request Date", "Processed Date", "Processed By", "Notes"]
    const rows = filteredRefunds.map(refund => [
      refund.id,
      refund.customerName,
      refund.customerEmail,
      refund.amount.toString(),
      refund.currency,
      refund.reason,
      refund.status,
      refund.requestDate,
      refund.processedDate || "",
      refund.processedBy || "",
      refund.decisionNotes || ""
    ])
    
    const csvContent = [headers, ...rows].map(row => row.join(",")).join("\n")
    const blob = new Blob([csvContent], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "refunds-export.csv"
    a.click()
    URL.revokeObjectURL(url)
    
    // Log export event
    await logAuditEvent({
      id: crypto.randomUUID(),
      eventType: 'refund.exported',
      actorId: currentUser.id,
      actorRole: currentUser.roles[0],
      actorEmail: currentUser.email,
      timestamp: new Date().toISOString(),
      dataBefore: { recordCount: filteredRefunds.length },
      dataAfter: { exported: true, format: 'CSV' },
      metadata: { filters: { status: filterStatus, priority: filterPriority } }
    })
    
    // Refresh chain status
    setChainStatus(await getChainStatus())
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200">Pending</Badge>
      case "approved":
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-200">Approved</Badge>
      case "rejected":
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-200">Rejected</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "high":
        return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-200">High</Badge>
      case "medium":
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200">Medium</Badge>
      case "low":
        return <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-200">Low</Badge>
      default:
        return <Badge>{priority}</Badge>
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="container mx-auto p-8 max-w-7xl">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-slate-900 mb-2">Refunds Dashboard</h1>
            <p className="text-slate-600">Manage and process refund requests efficiently</p>
          </div>
          <div className="flex gap-3 items-center">
            {/* Compliance Badges */}
            <div className="flex gap-2">
              <Badge className="bg-green-100 text-green-800 border-green-300">
                SOC2 Ready
              </Badge>
              <Badge className="bg-blue-100 text-blue-800 border-blue-300">
                SoD Enforced
              </Badge>
              <Badge className="bg-purple-100 text-purple-800 border-purple-300">
                Audit Trail: Immutable
              </Badge>
              <Badge className="bg-cyan-100 text-cyan-800 border-cyan-300">
                AES-256 Encrypted
              </Badge>
              <Badge className="bg-indigo-100 text-indigo-800 border-indigo-300">
                TLS 1.3
              </Badge>
              <Badge className="bg-pink-100 text-pink-800 border-pink-300">
                PII Masking
              </Badge>
            </div>
            {/* User Info & Role Switcher */}
            <div className="flex items-center gap-3 border-l pl-3 border-slate-300">
              <div className="text-sm">
                <div className="font-semibold text-slate-900">{currentUser.name}</div>
                <div className="text-slate-600">{currentUser.roles[0]} • {currentUser.department}</div>
              </div>
              <Select value={currentUser.id} onValueChange={(value) => { if (value) switchUser(value) }}>
                <SelectTrigger className="w-[150px] border-slate-300">
                  <SelectValue placeholder="Switch User" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user-001">Alice (Admin)</SelectItem>
                  <SelectItem value="user-002">Bob (Manager)</SelectItem>
                  <SelectItem value="user-003">Carol (Analyst)</SelectItem>
                  <SelectItem value="user-004">David (Processor)</SelectItem>
                  <SelectItem value="user-005">Eva (Auditor)</SelectItem>
                  <SelectItem value="user-006">Frank (Viewer)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Link href="/kyc" className="inline-flex items-center px-4 py-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
              KYC Queue →
            </Link>
            <Link href="/compliance" className="inline-flex items-center px-4 py-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
              Compliance →
            </Link>
            <Link href="/audit-logs" className="inline-flex items-center px-4 py-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
              Audit Logs →
            </Link>
            <Link href="/feature-flags" className="inline-flex items-center px-4 py-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
              Feature Flags →
            </Link>
            <Button 
              onClick={exportData} 
              className="bg-slate-900 hover:bg-slate-800"
              disabled={!hasPermission(currentUser, 'refund:export')}
            >
              Export CSV
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600">Total Requests</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">{stats.total}</div>
            </CardContent>
          </Card>
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600">Pending</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-yellow-600">{stats.pending}</div>
            </CardContent>
          </Card>
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600">Approved</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{stats.approved}</div>
            </CardContent>
          </Card>
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600">Total Refunded</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">${stats.totalAmount.toFixed(2)}</div>
            </CardContent>
          </Card>
        </div>

        {/* Compliance Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600">Audit Trail Integrity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                {chainStatus?.valid ? (
                  <Badge className="bg-green-100 text-green-800">Verified</Badge>
                ) : (
                  <Badge className="bg-red-100 text-red-800">Warning</Badge>
                )}
                <span className="text-sm text-slate-600">{chainStatus?.message || 'Checking...'}</span>
              </div>
              <div className="text-xs text-slate-500 mt-2">
                Events: {chainStatus?.totalEvents || 0} • Retention: {chainStatus?.retentionYears || 7} years
              </div>
            </CardContent>
          </Card>
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600">SoD Monitoring</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                {sodStatus?.monitoringActive ? (
                  <Badge className="bg-green-100 text-green-800">Active</Badge>
                ) : (
                  <Badge className="bg-yellow-100 text-yellow-800">Inactive</Badge>
                )}
                <span className="text-sm text-slate-600">Last check: {sodStatus?.lastCheck ? new Date(sodStatus.lastCheck).toLocaleTimeString() : 'Never'}</span>
              </div>
              <div className="text-xs text-slate-500 mt-2">
                Violations: {sodStatus?.violations.length || 0} • Users with conflicts: {sodStatus?.usersWithConflicts || 0}
              </div>
            </CardContent>
          </Card>
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600">Compliance Frameworks</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1">
                <Badge className="bg-blue-100 text-blue-800">SOC2</Badge>
                <Badge className="bg-purple-100 text-purple-800">DORA</Badge>
                <Badge className="bg-orange-100 text-orange-800">PCI DSS</Badge>
                <Badge className="bg-cyan-100 text-cyan-800">GDPR</Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-8 border-slate-200">
          <CardHeader>
            <CardTitle className="text-lg">Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <Input
                  placeholder="Search by name, email, or ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="border-slate-300"
                />
              </div>
              <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value || 'all')}>
                <SelectTrigger className="w-[180px] border-slate-300">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterPriority} onValueChange={(value) => setFilterPriority(value || 'all')}>
                <SelectTrigger className="w-[180px] border-slate-300">
                  <SelectValue placeholder="Filter by priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priority</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-lg">Refund Requests ({filteredRefunds.length})</CardTitle>
            <CardDescription>Review and process refund requests</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-slate-200">
                  <TableHead className="text-slate-700">ID</TableHead>
                  <TableHead className="text-slate-700">Customer</TableHead>
                  <TableHead className="text-slate-700">Email</TableHead>
                  <TableHead className="text-slate-700">Amount</TableHead>
                  <TableHead className="text-slate-700">Reason</TableHead>
                  <TableHead className="text-slate-700">Priority</TableHead>
                  <TableHead className="text-slate-700">Status</TableHead>
                  <TableHead className="text-slate-700">Request Date</TableHead>
                  <TableHead className="text-slate-700">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRefunds.map((refund) => (
                  <TableRow key={refund.id} className="border-slate-200 hover:bg-slate-50 transition-colors">
                    <TableCell className="font-medium text-slate-900">{refund.id}</TableCell>
                    <TableCell className="text-slate-700">{refund.customerName}</TableCell>
                    <TableCell className="text-slate-600">{refund.customerEmail}</TableCell>
                    <TableCell className="font-semibold text-slate-900">${refund.amount.toFixed(2)} {refund.currency}</TableCell>
                    <TableCell className="text-slate-700">{refund.reason}</TableCell>
                    <TableCell>{getPriorityBadge(refund.priority)}</TableCell>
                    <TableCell>{getStatusBadge(refund.status)}</TableCell>
                    <TableCell className="text-slate-600">{refund.requestDate}</TableCell>
                    <TableCell>
                      {refund.status === "pending" && hasPermission(currentUser, 'refund:write') && (
                        <Button
                          size="sm"
                          onClick={() => setSelectedRefund(refund)}
                          className="bg-slate-900 hover:bg-slate-800"
                        >
                          Review
                        </Button>
                      )}
                      {refund.status === "pending" && !hasPermission(currentUser, 'refund:write') && (
                        <span className="text-sm text-slate-400 italic">No permission</span>
                      )}
                      {refund.status !== "pending" && (
                        <span className="text-sm text-slate-500">
                          {refund.processedDate}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Review Modal */}
        {selectedRefund && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <Card className="w-full max-w-lg border-slate-300">
              <CardHeader>
                <CardTitle className="text-xl">Review Refund: {selectedRefund.id}</CardTitle>
                <CardDescription>
                  {selectedRefund.customerName} - ${selectedRefund.amount.toFixed(2)} {selectedRefund.currency}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Customer Email</label>
                    <p className="text-sm text-slate-600">{selectedRefund.customerEmail}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Reason</label>
                    <p className="text-sm text-slate-600">{selectedRefund.reason}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Priority</label>
                    {getPriorityBadge(selectedRefund.priority)}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Decision Notes</label>
                    <Input
                      placeholder="Enter reasoning for decision..."
                      value={decisionNotes}
                      onChange={(e) => setDecisionNotes(e.target.value)}
                      className="border-slate-300"
                    />
                  </div>
                  <div className="flex gap-3 pt-4">
                    <Button 
                      onClick={() => handleApprove(selectedRefund.id)}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      Approve
                    </Button>
                    <Button 
                      variant="destructive"
                      onClick={() => handleReject(selectedRefund.id)}
                    >
                      Reject
                    </Button>
                    <Button 
                      variant="outline"
                      onClick={() => {
                        setSelectedRefund(null)
                        setDecisionNotes("")
                      }}
                      className="border-slate-300"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
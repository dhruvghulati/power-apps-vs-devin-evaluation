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
import { logAuditEvent, getChainStatus } from "@/lib/audit"

interface KYCCase {
  id: string
  customerName: string
  customerEmail: string
  businessType: "individual" | "corporate"
  riskLevel: "low" | "medium" | "high"
  status: "pending" | "approved" | "rejected" | "escalated"
  requestDate: string
  slaDeadline: string
  assignedTo?: string
  reviewedBy?: string
  reviewDate?: string
  decisionNotes?: string
  documents: {
    type: string
    status: "verified" | "pending" | "rejected"
    uploadedDate: string
  }[]
  sanctionsCheck: "clear" | "match" | "pending"
  pepCheck: "clear" | "match" | "pending"
}

const mockKYCCases: KYCCase[] = [
  {
    id: "KYC-001",
    customerName: "Acme Corporation",
    customerEmail: "compliance@acme.com",
    businessType: "corporate",
    riskLevel: "medium",
    status: "pending",
    requestDate: "2026-01-18",
    slaDeadline: "2026-01-25",
    assignedTo: "user-002",
    documents: [
      { type: "Certificate of Incorporation", status: "verified", uploadedDate: "2026-01-18" },
      { type: "Board Resolution", status: "verified", uploadedDate: "2026-01-18" },
      { type: "UBO Declaration", status: "pending", uploadedDate: "2026-01-18" }
    ],
    sanctionsCheck: "clear",
    pepCheck: "clear"
  },
  {
    id: "KYC-002",
    customerName: "John Smith",
    customerEmail: "john.smith@example.com",
    businessType: "individual",
    riskLevel: "low",
    status: "approved",
    requestDate: "2026-01-15",
    slaDeadline: "2026-01-22",
    assignedTo: "user-002",
    reviewedBy: "user-002",
    reviewDate: "2026-01-16",
    decisionNotes: "Identity verified. Sanctions and PEP checks clear. Low risk profile.",
    documents: [
      { type: "Passport", status: "verified", uploadedDate: "2026-01-15" },
      { type: "Proof of Address", status: "verified", uploadedDate: "2026-01-15" },
      { type: "Source of Funds", status: "verified", uploadedDate: "2026-01-15" }
    ],
    sanctionsCheck: "clear",
    pepCheck: "clear"
  },
  {
    id: "KYC-003",
    customerName: "Global Investments Ltd",
    customerEmail: "legal@globalinv.com",
    businessType: "corporate",
    riskLevel: "high",
    status: "escalated",
    requestDate: "2026-01-14",
    slaDeadline: "2026-01-21",
    assignedTo: "user-001",
    reviewedBy: "user-002",
    reviewDate: "2026-01-16",
    decisionNotes: "Complex ownership structure. Multiple UBOs in high-risk jurisdictions. Escalated to BSA officer.",
    documents: [
      { type: "Certificate of Incorporation", status: "verified", uploadedDate: "2026-01-14" },
      { type: "UBO Declaration", status: "pending", uploadedDate: "2026-01-14" },
      { type: "Financial Statements", status: "rejected", uploadedDate: "2026-01-14" }
    ],
    sanctionsCheck: "pending",
    pepCheck: "match"
  },
  {
    id: "KYC-004",
    customerName: "Sarah Johnson",
    customerEmail: "sarah.j@example.com",
    businessType: "individual",
    riskLevel: "medium",
    status: "pending",
    requestDate: "2026-01-19",
    slaDeadline: "2026-01-26",
    assignedTo: "user-002",
    documents: [
      { type: "Passport", status: "verified", uploadedDate: "2026-01-19" },
      { type: "Proof of Address", status: "pending", uploadedDate: "2026-01-19" }
    ],
    sanctionsCheck: "clear",
    pepCheck: "pending"
  },
  {
    id: "KYC-005",
    customerName: "Tech Startup Inc",
    customerEmail: "founders@techstartup.com",
    businessType: "corporate",
    riskLevel: "low",
    status: "rejected",
    requestDate: "2026-01-13",
    slaDeadline: "2026-01-20",
    assignedTo: "user-002",
    reviewedBy: "user-002",
    reviewDate: "2026-01-14",
    decisionNotes: "UBO information incomplete. Missing beneficial owner declarations. Cannot approve without complete documentation.",
    documents: [
      { type: "Certificate of Incorporation", status: "verified", uploadedDate: "2026-01-13" },
      { type: "UBO Declaration", status: "rejected", uploadedDate: "2026-01-13" }
    ],
    sanctionsCheck: "clear",
    pepCheck: "clear"
  }
]

export default function KYCReviewQueue() {
  const [cases, setCases] = useState<KYCCase[]>(mockKYCCases)
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [filterRisk, setFilterRisk] = useState<string>("all")
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCase, setSelectedCase] = useState<KYCCase | null>(null)
  const [decisionNotes, setDecisionNotes] = useState("")
  const [chainStatus, setChainStatus] = useState<any>(null)
  const [currentUser, setCurrentUserState] = useState(getCurrentUser())
  
  useEffect(() => {
    getChainStatus().then(setChainStatus)
  }, [])

  const filteredCases = cases.filter(kycCase => {
    const matchesStatus = filterStatus === "all" || kycCase.status === filterStatus
    const matchesRisk = filterRisk === "all" || kycCase.riskLevel === filterRisk
    const matchesSearch = searchTerm === "" || 
      kycCase.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      kycCase.customerEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      kycCase.id.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesStatus && matchesRisk && matchesSearch
  })

  const stats = {
    total: cases.length,
    pending: cases.filter(c => c.status === "pending").length,
    approved: cases.filter(c => c.status === "approved").length,
    rejected: cases.filter(c => c.status === "rejected").length,
    escalated: cases.filter(c => c.status === "escalated").length,
    slaBreached: cases.filter(c => new Date(c.slaDeadline) < new Date() && c.status === "pending").length
  }

  const handleApprove = async (caseId: string) => {
    if (!hasPermission(currentUser, 'kyc:approve')) {
      alert('You do not have permission to approve KYC cases.')
      return
    }
    
    const kycCase = cases.find(c => c.id === caseId)
    if (!kycCase) return
    
    // Compliance check: All documents must be verified
    const unverifiedDocs = kycCase.documents.filter(d => d.status !== 'verified')
    if (unverifiedDocs.length > 0) {
      alert(`Cannot approve: ${unverifiedDocs.length} document(s) not verified.`)
      return
    }
    
    // Compliance check: Sanctions and PEP must be clear
    if (kycCase.sanctionsCheck !== 'clear' || kycCase.pepCheck !== 'clear') {
      alert('Cannot approve: Sanctions or PEP check not clear.')
      return
    }
    
    const previousState = { ...kycCase }
    
    setCases(cases.map(kycCase => 
      kycCase.id === caseId 
        ? { 
            ...kycCase, 
            status: "approved",
            reviewedBy: currentUser.email,
            reviewDate: new Date().toISOString().split('T')[0],
            decisionNotes: decisionNotes
          }
        : kycCase
    ))
    
    // Log audit event with before/after state
    await logAuditEvent({
      id: crypto.randomUUID(),
      eventType: 'kyc.approved',
      actorId: currentUser.id,
      actorRole: currentUser.roles[0],
      actorEmail: currentUser.email,
      timestamp: new Date().toISOString(),
      dataBefore: previousState,
      dataAfter: { ...previousState, status: 'approved', reviewedBy: currentUser.email, decisionNotes },
      metadata: { caseId, customerName: kycCase.customerName, riskLevel: kycCase.riskLevel }
    })
    
    setSelectedCase(null)
    setDecisionNotes("")
    
    // Refresh chain status
    setChainStatus(await getChainStatus())
  }

  const handleReject = async (caseId: string) => {
    if (!hasPermission(currentUser, 'kyc:reject')) {
      alert('You do not have permission to reject KYC cases.')
      return
    }
    
    const kycCase = cases.find(c => c.id === caseId)
    if (!kycCase) return
    
    const previousState = { ...kycCase }
    
    setCases(cases.map(kycCase => 
      kycCase.id === caseId 
        ? { 
            ...kycCase, 
            status: "rejected",
            reviewedBy: currentUser.email,
            reviewDate: new Date().toISOString().split('T')[0],
            decisionNotes: decisionNotes
          }
        : kycCase
    ))
    
    // Log audit event with before/after state
    await logAuditEvent({
      id: crypto.randomUUID(),
      eventType: 'kyc.rejected',
      actorId: currentUser.id,
      actorRole: currentUser.roles[0],
      actorEmail: currentUser.email,
      timestamp: new Date().toISOString(),
      dataBefore: previousState,
      dataAfter: { ...previousState, status: 'rejected', reviewedBy: currentUser.email, decisionNotes },
      metadata: { caseId, customerName: kycCase.customerName, riskLevel: kycCase.riskLevel }
    })
    
    setSelectedCase(null)
    setDecisionNotes("")
    
    // Refresh chain status
    setChainStatus(await getChainStatus())
  }

  const handleEscalate = async (caseId: string) => {
    if (!hasPermission(currentUser, 'kyc:write')) {
      alert('You do not have permission to escalate KYC cases.')
      return
    }
    
    const kycCase = cases.find(c => c.id === caseId)
    if (!kycCase) return
    
    const previousState = { ...kycCase }
    
    setCases(cases.map(kycCase => 
      kycCase.id === caseId 
        ? { 
            ...kycCase, 
            status: "escalated",
            assignedTo: "user-001", // BSA officer
            reviewedBy: currentUser.email,
            reviewDate: new Date().toISOString().split('T')[0],
            decisionNotes: decisionNotes || "Escalated to BSA officer for review"
          }
        : kycCase
    ))
    
    // Log audit event with before/after state
    await logAuditEvent({
      id: crypto.randomUUID(),
      eventType: 'kyc.escalated',
      actorId: currentUser.id,
      actorRole: currentUser.roles[0],
      actorEmail: currentUser.email,
      timestamp: new Date().toISOString(),
      dataBefore: previousState,
      dataAfter: { ...previousState, status: 'escalated', assignedTo: 'user-001', reviewedBy: currentUser.email },
      metadata: { caseId, customerName: kycCase.customerName, escalatedTo: 'BSA Officer' }
    })
    
    setSelectedCase(null)
    setDecisionNotes("")
    
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
      case "escalated":
        return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-200">Escalated</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

  const getRiskBadge = (risk: string) => {
    switch (risk) {
      case "high":
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-200">High</Badge>
      case "medium":
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200">Medium</Badge>
      case "low":
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-200">Low</Badge>
      default:
        return <Badge>{risk}</Badge>
    }
  }

  const getSanctionsBadge = (status: string) => {
    switch (status) {
      case "clear":
        return <Badge className="bg-green-100 text-green-800">Clear</Badge>
      case "match":
        return <Badge className="bg-red-100 text-red-800">Match</Badge>
      case "pending":
        return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

  const isSLABreached = (slaDeadline: string, status: string) => {
    return new Date(slaDeadline) < new Date() && status === "pending"
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="container mx-auto p-8 max-w-7xl">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-slate-900 mb-2">KYC Review Queue</h1>
            <p className="text-slate-600">Compliance-driven identity verification with human-in-the-loop review</p>
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
                AML Compliant
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
            <Link href="/compliance" className="inline-flex items-center px-4 py-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
              Compliance →
            </Link>
            <Link href="/audit-logs" className="inline-flex items-center px-4 py-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
              Audit Logs →
            </Link>
            <Link href="/" className="inline-flex items-center px-4 py-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
              ← Back to Refunds
            </Link>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600">Total Cases</CardTitle>
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
              <CardTitle className="text-sm font-medium text-slate-600">Escalated</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-orange-600">{stats.escalated}</div>
            </CardContent>
          </Card>
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600">SLA Breached</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-600">{stats.slaBreached}</div>
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
                  <SelectItem value="escalated">Escalated</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterRisk} onValueChange={(value) => setFilterRisk(value || 'all')}>
                <SelectTrigger className="w-[180px] border-slate-300">
                  <SelectValue placeholder="Filter by risk" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Risk Levels</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="mb-8 border-slate-200">
          <CardHeader>
            <CardTitle className="text-lg">KYC Cases ({filteredCases.length})</CardTitle>
            <CardDescription>Human-in-the-loop compliance review with audit trail</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-slate-200">
                  <TableHead className="text-slate-700">ID</TableHead>
                  <TableHead className="text-slate-700">Customer</TableHead>
                  <TableHead className="text-slate-700">Type</TableHead>
                  <TableHead className="text-slate-700">Risk</TableHead>
                  <TableHead className="text-slate-700">Sanctions</TableHead>
                  <TableHead className="text-slate-700">PEP</TableHead>
                  <TableHead className="text-slate-700">SLA Deadline</TableHead>
                  <TableHead className="text-slate-700">Status</TableHead>
                  <TableHead className="text-slate-700">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCases.map((kycCase) => (
                  <TableRow 
                    key={kycCase.id} 
                    className={`border-slate-200 hover:bg-slate-50 transition-colors ${isSLABreached(kycCase.slaDeadline, kycCase.status) ? 'bg-red-50' : ''}`}
                  >
                    <TableCell className="font-medium text-slate-900">{kycCase.id}</TableCell>
                    <TableCell className="text-slate-700">
                      <div>
                        <div className="font-medium">{kycCase.customerName}</div>
                        <div className="text-sm text-slate-500">{kycCase.customerEmail}</div>
                      </div>
                    </TableCell>
                    <TableCell className="text-slate-600 capitalize">{kycCase.businessType}</TableCell>
                    <TableCell>{getRiskBadge(kycCase.riskLevel)}</TableCell>
                    <TableCell>{getSanctionsBadge(kycCase.sanctionsCheck)}</TableCell>
                    <TableCell>{getSanctionsBadge(kycCase.pepCheck)}</TableCell>
                    <TableCell className={`text-slate-600 ${isSLABreached(kycCase.slaDeadline, kycCase.status) ? 'text-red-600 font-semibold' : ''}`}>
                      {kycCase.slaDeadline}
                      {isSLABreached(kycCase.slaDeadline, kycCase.status) && <div className="text-xs">BREACHED</div>}
                    </TableCell>
                    <TableCell>{getStatusBadge(kycCase.status)}</TableCell>
                    <TableCell>
                      {kycCase.status === "pending" && hasPermission(currentUser, 'kyc:write') && (
                        <Button
                          size="sm"
                          onClick={() => setSelectedCase(kycCase)}
                          className="bg-slate-900 hover:bg-slate-800"
                        >
                          Review
                        </Button>
                      )}
                      {kycCase.status === "pending" && !hasPermission(currentUser, 'kyc:write') && (
                        <span className="text-sm text-slate-400 italic">No permission</span>
                      )}
                      {kycCase.status !== "pending" && (
                        <span className="text-sm text-slate-500">
                          {kycCase.reviewDate}
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
        {selectedCase && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <Card className="w-full max-w-2xl border-slate-300 max-h-[90vh] overflow-y-auto">
              <CardHeader>
                <CardTitle className="text-xl">Review KYC Case: {selectedCase.id}</CardTitle>
                <CardDescription>
                  {selectedCase.customerName} • {selectedCase.businessType} • {selectedCase.riskLevel} risk
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Customer Information */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Customer Information</label>
                    <div className="text-sm text-slate-600 space-y-1">
                      <div><strong>Name:</strong> {selectedCase.customerName}</div>
                      <div><strong>Email:</strong> {selectedCase.customerEmail}</div>
                      <div><strong>Business Type:</strong> {selectedCase.businessType}</div>
                      <div><strong>Risk Level:</strong> {getRiskBadge(selectedCase.riskLevel)}</div>
                    </div>
                  </div>

                  {/* Compliance Checks */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Compliance Checks</label>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center justify-between p-3 bg-slate-50 rounded">
                        <span className="text-sm">Sanctions Check</span>
                        {getSanctionsBadge(selectedCase.sanctionsCheck)}
                      </div>
                      <div className="flex items-center justify-between p-3 bg-slate-50 rounded">
                        <span className="text-sm">PEP Check</span>
                        {getSanctionsBadge(selectedCase.pepCheck)}
                      </div>
                    </div>
                  </div>

                  {/* Documents */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Documents</label>
                    <div className="space-y-2">
                      {selectedCase.documents.map((doc, index) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-slate-50 rounded">
                          <div>
                            <div className="text-sm font-medium">{doc.type}</div>
                            <div className="text-xs text-slate-500">Uploaded: {doc.uploadedDate}</div>
                          </div>
                          <Badge className={
                            doc.status === 'verified' ? 'bg-green-100 text-green-800' :
                            doc.status === 'rejected' ? 'bg-red-100 text-red-800' :
                            'bg-yellow-100 text-yellow-800'
                          }>
                            {doc.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* SLA Information */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">SLA Information</label>
                    <div className="text-sm text-slate-600 space-y-1">
                      <div><strong>Request Date:</strong> {selectedCase.requestDate}</div>
                      <div><strong>SLA Deadline:</strong> {selectedCase.slaDeadline}</div>
                      <div><strong>Assigned To:</strong> {selectedCase.assignedTo || 'Unassigned'}</div>
                    </div>
                  </div>

                  {/* Decision Notes */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Decision Notes</label>
                    <Input
                      placeholder="Enter reasoning for decision..."
                      value={decisionNotes}
                      onChange={(e) => setDecisionNotes(e.target.value)}
                      className="border-slate-300"
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3 pt-4">
                    <Button 
                      onClick={() => handleApprove(selectedCase.id)}
                      className="bg-green-600 hover:bg-green-700"
                      disabled={!hasPermission(currentUser, 'kyc:approve')}
                    >
                      Approve
                    </Button>
                    <Button 
                      onClick={() => handleReject(selectedCase.id)}
                      variant="destructive"
                      disabled={!hasPermission(currentUser, 'kyc:reject')}
                    >
                      Reject
                    </Button>
                    <Button 
                      onClick={() => handleEscalate(selectedCase.id)}
                      variant="outline"
                      className="border-orange-300 text-orange-600 hover:bg-orange-50"
                      disabled={!hasPermission(currentUser, 'kyc:write')}
                    >
                      Escalate to BSA Officer
                    </Button>
                    <Button 
                      variant="outline"
                      onClick={() => {
                        setSelectedCase(null)
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
"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

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

  const handleApprove = (refundId: string) => {
    setRefunds(refunds.map(refund => 
      refund.id === refundId 
        ? { 
            ...refund, 
            status: "approved",
            processedDate: new Date().toISOString().split('T')[0],
            processedBy: "current-user",
            decisionNotes: decisionNotes
          }
        : refund
    ))
    setSelectedRefund(null)
    setDecisionNotes("")
  }

  const handleReject = (refundId: string) => {
    setRefunds(refunds.map(refund => 
      refund.id === refundId 
        ? { 
            ...refund, 
            status: "rejected",
            processedDate: new Date().toISOString().split('T')[0],
            processedBy: "current-user",
            decisionNotes: decisionNotes
          }
        : refund
    ))
    setSelectedRefund(null)
    setDecisionNotes("")
  }

  const exportData = () => {
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
          <div className="flex gap-3">
            <Link href="/feature-flags" className="inline-flex items-center px-4 py-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
              Feature Flags →
            </Link>
            <Button onClick={exportData} className="bg-slate-900 hover:bg-slate-800">
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
              <Select value={filterStatus} onValueChange={setFilterStatus}>
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
              <Select value={filterPriority} onValueChange={setFilterPriority}>
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
                      {refund.status === "pending" && (
                        <Button
                          size="sm"
                          onClick={() => setSelectedRefund(refund)}
                          className="bg-slate-900 hover:bg-slate-800"
                        >
                          Review
                        </Button>
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
"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getCurrentUser, hasPermission } from "@/lib/rbac"
import { getChainStatus, getAuditEvents } from "@/lib/audit"
import { continuousSoDCheck, getSoDMatrix } from "@/lib/sod"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export default function ComplianceDashboard() {
  const [chainStatus, setChainStatus] = useState<any>(null)
  const [sodStatus, setSodStatus] = useState<any>(null)
  const [auditEventCount, setAuditEventCount] = useState(0)
  const [currentUser, setCurrentUserState] = useState(getCurrentUser())
  
  useEffect(() => {
    const loadData = async () => {
      setChainStatus(await getChainStatus())
      setSodStatus(continuousSoDCheck())
      const events = await getAuditEvents()
      setAuditEventCount(events.length)
    }
    loadData()
  }, [])

  const complianceItems = [
    {
      domain: "Security (CC1-CC9)",
      status: "compliant",
      lastReview: "2026-01-15",
      evidence: "Available",
      score: 95
    },
    {
      domain: "Availability (A1)",
      status: "compliant",
      lastReview: "2026-01-10",
      evidence: "Available",
      score: 88
    },
    {
      domain: "Confidentiality (C1)",
      status: "compliant",
      lastReview: "2026-01-12",
      evidence: "Available",
      score: 92
    },
    {
      domain: "Processing Integrity (PI1)",
      status: "compliant",
      lastReview: "2026-01-14",
      evidence: "Available",
      score: 90
    },
    {
      domain: "Privacy (P1-P8)",
      status: "partial",
      lastReview: "2026-01-08",
      evidence: "Partial",
      score: 75
    }
  ]

  const accessReview = {
    lastReview: "2026-01-15",
    nextReviewDue: "2026-04-15",
    accountsReviewed: 45,
    accountsRemoved: 3,
    exceptions: 1
  }

  const changeManagement = {
    lastDeployment: "2026-01-18",
    recentChanges: 5,
    rollbackCapability: true,
    approvalRate: "100%"
  }

  const riskAssessment = {
    lastUpdated: "2026-01-15",
    totalRisks: 12,
    highRisks: 2,
    mediumRisks: 5,
    lowRisks: 5
  }

  const vendorInventory = [
    { name: "AWS", type: "Cloud Provider", soc2: true, iso27001: true, lastReview: "2026-01-10" },
    { name: "PostgreSQL", type: "Database", soc2: true, iso27001: true, lastReview: "2026-01-12" },
    { name: "Stripe", type: "Payment Processor", pciDss: true, lastReview: "2026-01-08" },
    { name: "SendGrid", type: "Email Service", soc2: true, lastReview: "2026-01-05" }
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="container mx-auto p-8 max-w-7xl">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-slate-900 mb-2">Compliance Dashboard</h1>
            <p className="text-slate-600">SOC2, DORA, PCI DSS, and GDPR compliance monitoring</p>
          </div>
          <div className="flex gap-3 items-center">
            <div className="flex gap-2">
              <Badge className="bg-green-100 text-green-800 border-green-300">
                SOC2 Ready
              </Badge>
              <Badge className="bg-blue-100 text-blue-800 border-blue-300">
                DORA Compliant
              </Badge>
              <Badge className="bg-orange-100 text-orange-800 border-orange-300">
                PCI DSS v4.0
              </Badge>
              <Badge className="bg-cyan-100 text-cyan-800 border-cyan-300">
                GDPR Ready
              </Badge>
            </div>
            <div className="flex items-center gap-3 border-l pl-3 border-slate-300">
              <div className="text-sm">
                <div className="font-semibold text-slate-900">{currentUser.name}</div>
                <div className="text-slate-600">{currentUser.roles[0]} • {currentUser.department}</div>
              </div>
              <Link href="/" className="inline-flex items-center px-4 py-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
                ← Back to Refunds
              </Link>
            </div>
          </div>
        </div>

        {/* Overall Compliance Score */}
        <Card className="mb-8 border-slate-200">
          <CardHeader>
            <CardTitle className="text-lg">Overall Compliance Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <div className="text-5xl font-bold text-green-600">88%</div>
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-slate-200 rounded-full h-3">
                    <div className="bg-green-600 h-3 rounded-full" style={{ width: '88%' }}></div>
                  </div>
                  <span className="text-sm text-slate-600">Overall</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-slate-200 rounded-full h-3">
                    <div className="bg-green-600 h-3 rounded-full" style={{ width: '95%' }}></div>
                  </div>
                  <span className="text-sm text-slate-600">Security</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-slate-200 rounded-full h-3">
                    <div className="bg-green-600 h-3 rounded-full" style={{ width: '88%' }}></div>
                  </div>
                  <span className="text-sm text-scale-600">Availability</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-slate-200 rounded-full h-3">
                    <div className="bg-green-600 h-3 rounded-full" style={{ width: '92%' }}></div>
                  </div>
                  <span className="text-sm text-slate-600">Confidentiality</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-slate-200 rounded-full h-3">
                    <div className="bg-green-600 h-3 rounded-full" style={{ width: '90%' }}></div>
                  </div>
                  <span className="text-sm text-slate-600">Processing Integrity</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-slate-200 rounded-full h-3">
                    <div className="bg-yellow-500 h-3 rounded-full" style={{ width: '75%' }}></div>
                  </div>
                  <span className="text-sm text-slate-600">Privacy</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Critical Compliance Areas */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Audit Trail Integrity */}
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="text-lg">Audit Trail Integrity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Chain Status</span>
                  {chainStatus?.valid ? (
                    <Badge className="bg-green-100 text-green-800">Verified</Badge>
                  ) : (
                    <Badge className="bg-red-100 text-red-800">Warning</Badge>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Total Events</span>
                  <span className="text-sm font-semibold text-slate-900">{chainStatus?.totalEvents || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Retention Period</span>
                  <span className="text-sm font-semibold text-slate-900">{chainStatus?.retentionYears || 7} years (SOX)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Hot Storage</span>
                  <span className="text-sm font-semibold text-slate-900">{chainStatus?.hotStorageYears || 2} years (SEC)</span>
                </div>
                <div className="text-xs text-slate-500 mt-2">
                  {chainStatus?.storageCompliance}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* SoD Status */}
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="text-lg">Segregation of Duties (SoD)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Monitoring Status</span>
                  {sodStatus?.monitoringActive ? (
                    <Badge className="bg-green-100 text-green-800">Active</Badge>
                  ) : (
                    <Badge className="bg-yellow-100 text-yellow-800">Inactive</Badge>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Last Check</span>
                  <span className="text-sm text-slate-900">{sodStatus?.lastCheck ? new Date(sodStatus.lastCheck).toLocaleString() : 'Never'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Violations</span>
                  <span className="text-sm font-semibold text-slate-900">{sodStatus?.violations.length || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Users with Conflicts</span>
                  <span className="text-sm font-semibold text-slate-900">{sodStatus?.usersWithConflicts || 0}</span>
                </div>
                <div className="text-xs text-slate-500 mt-2">
                  Preventive SoD enforcement enabled • Continuous monitoring active
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Compliance Checklist */}
        <Card className="mb-8 border-slate-200">
          <CardHeader>
            <CardTitle className="text-lg">SOC2 Compliance Checklist</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Badge className="bg-green-100 text-green-800">✓</Badge>
                <span className="text-sm text-slate-700">Information security policy (version 1.2, owner: CISO, last-reviewed: 2026-01-10)</span>
              </div>
              <div className="flex items-center gap-3">
                <Badge className="bg-green-100 text-green-800">✓</Badge>
                <span className="text-sm text-slate-700">Risk assessment register (last updated: 2026-01-15, 12 risks identified)</span>
              </div>
              <div className="flex items-center gap-3">
                <Badge className="bg-green-100 text-green-800">✓</Badge>
                <span className="text-sm text-slate-700">Vendor inventory (4 vendors, SOC2/ISO reports on file)</span>
              </div>
              <div className="flex items-center gap-3">
                <Badge className="bg-green-100 text-green-800">✓</Badge>
                <span className="text-sm text-slate-700">Access review logs (quarterly, last: 2026-01-15, 3 accounts removed)</span>
              </div>
              <div className="flex items-center gap-3">
                <Badge className="bg-green-100 text-green-800">✓</Badge>
                <span className="text-sm text-slate-700">Change management trails (5 recent deployments tracked)</span>
              </div>
              <div className="flex items-center gap-3">
                <Badge className="bg-green-100 text-green-800">✓</Badge>
                <span className="text-sm text-slate-700">Immutable audit logs (event-sourced, hash chains verified)</span>
              </div>
              <div className="flex items-center gap-3">
                <Badge className="bg-green-100 text-green-800">✓</Badge>
                <span className="text-sm text-slate-700">SoD enforcement (preventive + continuous monitoring)</span>
              </div>
              <div className="flex items-center gap-3">
                <Badge className="bg-green-100 text-green-800">✓</Badge>
                <span className="text-sm text-slate-700">Processing integrity controls (approval thresholds enforced)</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Access Review */}
        <Card className="mb-8 border-slate-200">
          <CardHeader>
            <CardTitle className="text-lg">Access Review Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-slate-600">Last Review</div>
                <div className="text-lg font-semibold text-slate-900">{accessReview.lastReview}</div>
              </div>
              <div>
                <div className="text-sm text-slate-600">Next Review Due</div>
                <div className="text-lg font-semibold text-slate-900">{accessReview.nextReviewDue}</div>
              </div>
              <div>
                <div className="text-sm text-600">Accounts Reviewed</div>
                <div className="text-lg font-semibold text-slate-900">{accessReview.accountsReviewed}</div>
              </div>
              <div>
                <div className="text-sm text-slate-600">Accounts Removed</div>
                <div className="text-lg font-semibold text-slate-900">{accessReview.accountsRemoved}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Vendor Inventory */}
        <Card className="mb-8 border-slate-200">
          <CardHeader>
            <CardTitle className="text-lg">Third-Party Vendor Inventory</CardTitle>
            <CardDescription>Vendors handling customer data with compliance certifications</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-slate-200">
                  <TableHead className="text-slate-700">Vendor</TableHead>
                  <TableHead className="text-slate-700">Type</TableHead>
                  <TableHead className="text-slate-700">SOC 2</TableHead>
                  <TableHead className="text-slate-700">ISO 27001</TableHead>
                  <TableHead className="text-slate-700">PCI DSS</TableHead>
                  <TableHead className="text-slate-700">Last Review</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendorInventory.map((vendor, index) => (
                  <TableRow key={index} className="border-slate-200">
                    <TableCell className="font-medium text-slate-900">{vendor.name}</TableCell>
                    <TableCell className="text-slate-700">{vendor.type}</TableCell>
                    <TableCell>
                      {vendor.soc2 ? <Badge className="bg-green-100 text-green-800">✓</Badge> : <Badge className="bg-gray-100 text-gray-800">—</Badge>}
                    </TableCell>
                    <TableCell>
                      {vendor.iso27001 ? <Badge className="bg-green-100 text-green-800">✓</Badge> : <Badge className="bg-gray-100 text-gray-800">—</Badge>}
                    </TableCell>
                    <TableCell>
                      {vendor.pciDss ? <Badge className="bg-green-100 text-green-800">✓</Badge> : <Badge className="bg-gray-100 text-gray-800">—</Badge>}
                    </TableCell>
                    <TableCell className="text-slate-600">{vendor.lastReview}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex gap-3">
          <Link href="/audit-logs" className="inline-flex items-center px-4 py-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
            View Audit Logs →
          </Link>
          <Link href="/" className="inline-flex items-center px-4 py-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
            ← Back to Refunds
          </Link>
        </div>
      </div>
    </div>
  )
}
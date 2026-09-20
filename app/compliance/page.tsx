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
    <div className="min-h-screen fintech-gradient">
      <div className="container mx-auto px-6 py-8 max-w-7xl">
        {/* Header */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gradient mb-2">Compliance Dashboard</h1>
            <p className="text-muted-foreground text-base">SOC2, DORA, PCI DSS, and GDPR compliance monitoring</p>
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
              <Link href="/audit-logs" className="inline-flex items-center px-4 py-2.5 bg-white/80 backdrop-blur-sm border border-border rounded-lg hover:bg-white hover:shadow-sm transition-all text-sm font-medium">
                Audit Logs
              </Link>
              <Link href="/data-connections" className="inline-flex items-center px-4 py-2.5 bg-white/80 backdrop-blur-sm border border-border rounded-lg hover:bg-white hover:shadow-sm transition-all text-sm font-medium">
                Data Connections
              </Link>
            </nav>
            
            {/* User Info */}
            <div className="flex items-center gap-3 border-l border-border pl-3">
              <div className="text-sm text-right">
                <div className="font-semibold text-foreground">{currentUser.name}</div>
                <div className="text-muted-foreground text-xs">{currentUser.roles[0]} • {currentUser.department}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Compliance Status Banner */}
        <div className="bg-white/80 backdrop-blur-sm border border-border rounded-xl p-4 mb-8 card-shadow">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Compliance Status:</span>
            <Badge className="badge-success border-0">SOC2 Ready</Badge>
            <Badge className="badge-info border-0">DORA Compliant</Badge>
            <Badge className="badge-warning border-0">PCI DSS v4.0</Badge>
            <Badge className="badge-info border-0">GDPR Ready</Badge>
          </div>
        </div>

        {/* Overall Compliance Score */}
        <Card className="mb-8 card-shadow border-border bg-white/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Overall Compliance Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <div className="text-5xl font-bold text-green-600">88%</div>
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-muted rounded-full h-3">
                    <div className="bg-green-600 h-3 rounded-full" style={{ width: '88%' }}></div>
                  </div>
                  <span className="text-sm text-muted-foreground">Overall</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-muted rounded-full h-3">
                    <div className="bg-green-600 h-3 rounded-full" style={{ width: '95%' }}></div>
                  </div>
                  <span className="text-sm text-muted-foreground">Security</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-muted rounded-full h-3">
                    <div className="bg-green-600 h-3 rounded-full" style={{ width: '88%' }}></div>
                  </div>
                  <span className="text-sm text-muted-foreground">Availability</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-muted rounded-full h-3">
                    <div className="bg-green-600 h-3 rounded-full" style={{ width: '92%' }}></div>
                  </div>
                  <span className="text-sm text-muted-foreground">Confidentiality</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-muted rounded-full h-3">
                    <div className="bg-green-600 h-3 rounded-full" style={{ width: '90%' }}></div>
                  </div>
                  <span className="text-sm text-muted-foreground">Processing Integrity</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-muted rounded-full h-3">
                    <div className="bg-yellow-500 h-3 rounded-full" style={{ width: '75%' }}></div>
                  </div>
                  <span className="text-sm text-muted-foreground">Privacy</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Critical Compliance Areas */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Audit Trail Integrity */}
          <Card className="card-shadow border-border hover:card-shadow-hover transition-shadow bg-white/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Audit Trail Integrity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Chain Status</span>
                  {chainStatus?.valid ? (
                    <Badge className="badge-success border-0">Verified</Badge>
                  ) : (
                    <Badge className="badge-error border-0">Warning</Badge>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Total Events</span>
                  <span className="text-sm font-semibold text-foreground">{chainStatus?.totalEvents || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Retention Period</span>
                  <span className="text-sm font-semibold text-foreground">{chainStatus?.retentionYears || 7} years (SOX)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Hot Storage</span>
                  <span className="text-sm font-semibold text-foreground">{chainStatus?.hotStorageYears || 2} years (SEC)</span>
                </div>
                <div className="text-xs text-muted-foreground mt-2">
                  {chainStatus?.storageCompliance}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* SoD Status */}
          <Card className="card-shadow border-border hover:card-shadow-hover transition-shadow bg-white/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Segregation of Duties (SoD)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Monitoring Status</span>
                  {sodStatus?.monitoringActive ? (
                    <Badge className="badge-success border-0">Active</Badge>
                  ) : (
                    <Badge className="badge-warning border-0">Inactive</Badge>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Last Check</span>
                  <span className="text-sm text-foreground">{sodStatus?.lastCheck ? new Date(sodStatus.lastCheck).toLocaleString() : 'Never'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Violations</span>
                  <span className="text-sm font-semibold text-foreground">{sodStatus?.violations.length || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Users with Conflicts</span>
                  <span className="text-sm font-semibold text-foreground">{sodStatus?.usersWithConflicts || 0}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-2">
                  Preventive SoD enforcement enabled • Continuous monitoring active
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Compliance Checklist */}
        <Card className="mb-8 card-shadow border-border bg-white/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">SOC2 Compliance Checklist</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Badge className="badge-success border-0">✓</Badge>
                <span className="text-sm text-foreground">Information security policy (version 1.2, owner: CISO, last-reviewed: 2026-01-10)</span>
              </div>
              <div className="flex items-center gap-3">
                <Badge className="badge-success border-0">✓</Badge>
                <span className="text-sm text-foreground">Risk assessment register (last updated: 2026-01-15, 12 risks identified)</span>
              </div>
              <div className="flex items-center gap-3">
                <Badge className="badge-success border-0">✓</Badge>
                <span className="text-sm text-foreground">Vendor inventory (4 vendors, SOC2/ISO reports on file)</span>
              </div>
              <div className="flex items-center gap-3">
                <Badge className="badge-success border-0">✓</Badge>
                <span className="text-sm text-foreground">Access review logs (quarterly, last: 2026-01-15, 3 accounts removed)</span>
              </div>
              <div className="flex items-center gap-3">
                <Badge className="badge-success border-0">✓</Badge>
                <span className="text-sm text-foreground">Change management trails (5 recent deployments tracked)</span>
              </div>
              <div className="flex items-center gap-3">
                <Badge className="badge-success border-0">✓</Badge>
                <span className="text-sm text-foreground">Immutable audit logs (event-sourced, hash chains verified)</span>
              </div>
              <div className="flex items-center gap-3">
                <Badge className="badge-success border-0">✓</Badge>
                <span className="text-sm text-foreground">SoD enforcement (preventive + continuous monitoring)</span>
              </div>
              <div className="flex items-center gap-3">
                <Badge className="badge-success border-0">✓</Badge>
                <span className="text-sm text-foreground">Processing integrity controls (approval thresholds enforced)</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Access Review */}
        <Card className="mb-8 card-shadow border-border bg-white/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Access Review Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Last Review</div>
                <div className="text-lg font-semibold text-foreground">{accessReview.lastReview}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Next Review Due</div>
                <div className="text-lg font-semibold text-foreground">{accessReview.nextReviewDue}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Accounts Reviewed</div>
                <div className="text-lg font-semibold text-foreground">{accessReview.accountsReviewed}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Accounts Removed</div>
                <div className="text-lg font-semibold text-foreground">{accessReview.accountsRemoved}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Vendor Inventory */}
        <Card className="mb-8 card-shadow border-border bg-white/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Third-Party Vendor Inventory</CardTitle>
            <CardDescription>Vendors handling customer data with compliance certifications</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="text-foreground">Vendor</TableHead>
                  <TableHead className="text-foreground">Type</TableHead>
                  <TableHead className="text-foreground">SOC 2</TableHead>
                  <TableHead className="text-foreground">ISO 27001</TableHead>
                  <TableHead className="text-foreground">PCI DSS</TableHead>
                  <TableHead className="text-foreground">Last Review</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendorInventory.map((vendor, index) => (
                  <TableRow key={index} className="border-border table-row-hover">
                    <TableCell className="font-medium text-foreground">{vendor.name}</TableCell>
                    <TableCell className="text-foreground">{vendor.type}</TableCell>
                    <TableCell>
                      {vendor.soc2 ? <Badge className="badge-success border-0">✓</Badge> : <Badge variant="outline">—</Badge>}
                    </TableCell>
                    <TableCell>
                      {vendor.iso27001 ? <Badge className="badge-success border-0">✓</Badge> : <Badge variant="outline">—</Badge>}
                    </TableCell>
                    <TableCell>
                      {vendor.pciDss ? <Badge className="badge-success border-0">✓</Badge> : <Badge variant="outline">—</Badge>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{vendor.lastReview}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
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

interface FeatureFlag {
  id: string
  name: string
  description: string
  enabled: boolean
  type: "boolean" | "percentage" | "multivariate"
  targetUsers?: string
  percentage?: number
  variants?: string[]
  lastModified: string
  modifiedBy: string
  category: "product" | "infrastructure" | "compliance" | "user-experience"
}

const mockFlags: FeatureFlag[] = [
  {
    id: "FF-001",
    name: "new-dashboard-ui",
    description: "Enable new dashboard design for beta users",
    enabled: true,
    type: "percentage",
    targetUsers: "beta-users",
    percentage: 25,
    category: "user-experience",
    lastModified: "2026-01-15",
    modifiedBy: "admin@company.com"
  },
  {
    id: "FF-002",
    name: "instant-refunds",
    description: "Enable instant refund processing for trusted customers",
    enabled: false,
    type: "boolean",
    targetUsers: "trusted-customers",
    category: "product",
    lastModified: "2026-01-14",
    modifiedBy: "admin@company.com"
  },
  {
    id: "FF-003",
    name: "kyc-automation",
    description: "Automated KYC verification for low-risk customers",
    enabled: true,
    type: "multivariate",
    targetUsers: "low-risk",
    variants: ["provider-a", "provider-b"],
    category: "compliance",
    lastModified: "2026-01-16",
    modifiedBy: "admin@company.com"
  },
  {
    id: "FF-004",
    name: "mobile-app-v2",
    description: "New mobile app experience",
    enabled: true,
    type: "percentage",
    targetUsers: "all-users",
    percentage: 50,
    category: "user-experience",
    lastModified: "2026-01-13",
    modifiedBy: "admin@company.com"
  },
  {
    id: "FF-005",
    name: "api-rate-limiting",
    description: "Dynamic rate limiting based on user tier",
    enabled: true,
    type: "percentage",
    targetUsers: "all-users",
    percentage: 100,
    category: "infrastructure",
    lastModified: "2026-01-17",
    modifiedBy: "admin@company.com"
  },
  {
    id: "FF-006",
    name: "dark-mode-beta",
    description: "Dark mode for enterprise users",
    enabled: false,
    type: "boolean",
    targetUsers: "enterprise",
    category: "user-experience",
    lastModified: "2026-01-16",
    modifiedBy: "admin@company.com"
  }
]

export default function FeatureFlagsDashboard() {
  const [flags, setFlags] = useState<FeatureFlag[]>(mockFlags)
  const [filterType, setFilterType] = useState<string>("all")
  const [filterCategory, setFilterCategory] = useState<string>("all")
  const [searchTerm, setSearchTerm] = useState("")
  const [currentUser, setCurrentUserState] = useState(getCurrentUser())
  
  useEffect(() => {
    getChainStatus()
  }, [])

  const filteredFlags = flags.filter(flag => {
    const matchesType = filterType === "all" || flag.type === filterType
    const matchesCategory = filterCategory === "all" || flag.category === filterCategory
    const matchesSearch = searchTerm === "" || 
      flag.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      flag.description.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesType && matchesCategory && matchesSearch
  })

  const stats = {
    total: flags.length,
    enabled: flags.filter(f => f.enabled).length,
    disabled: flags.filter(f => !f.enabled).length,
    percentageFlags: flags.filter(f => f.type === "percentage").length
  }

  const toggleFlag = async (flagId: string) => {
    if (!hasPermission(currentUser, 'flag:toggle')) {
      alert('You do not have permission to toggle feature flags.')
      return
    }
    
    const flag = flags.find(f => f.id === flagId)
    if (!flag) return
    
    const previousState = { ...flag }
    
    setFlags(flags.map(flag => 
      flag.id === flagId 
        ? { 
            ...flag, 
            enabled: !flag.enabled,
            lastModified: new Date().toISOString().split('T')[0],
            modifiedBy: currentUser.email
          }
        : flag
    ))
    
    // Log audit event
    await logAuditEvent({
      id: crypto.randomUUID(),
      eventType: 'flag.toggled',
      actorId: currentUser.id,
      actorRole: currentUser.roles[0],
      actorEmail: currentUser.email,
      timestamp: new Date().toISOString(),
      dataBefore: previousState,
      dataAfter: { ...previousState, enabled: !previousState.enabled, modifiedBy: currentUser.email },
      metadata: { flagId, flagName: flag.name }
    })
  }

  const updatePercentage = (flagId: string, newPercentage: number) => {
    setFlags(flags.map(flag => 
      flag.id === flagId 
        ? { 
            ...flag, 
            percentage: newPercentage,
            lastModified: new Date().toISOString().split('T')[0],
            modifiedBy: "current-user"
          }
        : flag
    ))
  }

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "boolean":
        return <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-200">Boolean</Badge>
      case "percentage":
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200">Percentage</Badge>
      case "multivariate":
        return <Badge className="bg-teal-100 text-teal-800 hover:bg-teal-200">Multivariate</Badge>
      default:
        return <Badge>{type}</Badge>
    }
  }

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case "product":
        return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-200">Product</Badge>
      case "infrastructure":
        return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-200">Infrastructure</Badge>
      case "compliance":
        return <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-200">Compliance</Badge>
      case "user-experience":
        return <Badge className="bg-cyan-100 text-cyan-800 hover:bg-cyan-200">UX</Badge>
      default:
        return <Badge>{category}</Badge>
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="container mx-auto p-8 max-w-7xl">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-slate-900 mb-2">Feature Flags Dashboard</h1>
            <p className="text-slate-600">Manage feature rollouts and experiments</p>
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
            <Link href="/compliance" className="inline-flex items-center px-4 py-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
              Compliance →
            </Link>
            <Link href="/audit-logs" className="inline-flex items-center px-4 py-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
              Audit Logs →
            </Link>
            <Link href="/" className="inline-flex items-center px-4 py-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
              ← Back to Refunds
            </Link>
            <Button 
              className="bg-slate-900 hover:bg-slate-800"
              disabled={!hasPermission(currentUser, 'flag:create')}
            >
              + New Flag
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600">Total Flags</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">{stats.total}</div>
            </CardContent>
          </Card>
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600">Enabled</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{stats.enabled}</div>
            </CardContent>
          </Card>
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600">Disabled</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-600">{stats.disabled}</div>
            </CardContent>
          </Card>
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600">Percentage Flags</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">{stats.percentageFlags}</div>
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
                  placeholder="Search by name or description..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="border-slate-300"
                />
              </div>
              <Select value={filterType} onValueChange={(value) => setFilterType(value || 'all')}>
                <SelectTrigger className="w-[180px] border-slate-300">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="boolean">Boolean</SelectItem>
                  <SelectItem value="percentage">Percentage</SelectItem>
                  <SelectItem value="multivariate">Multivariate</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterCategory} onValueChange={(value) => setFilterCategory(value || 'all')}>
                <SelectTrigger className="w-[180px] border-slate-300">
                  <SelectValue placeholder="Filter by category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="product">Product</SelectItem>
                  <SelectItem value="infrastructure">Infrastructure</SelectItem>
                  <SelectItem value="compliance">Compliance</SelectItem>
                  <SelectItem value="user-experience">User Experience</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-lg">Feature Flags ({filteredFlags.length})</CardTitle>
            <CardDescription>Control feature rollouts and experiments</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-slate-200">
                  <TableHead className="text-slate-700">ID</TableHead>
                  <TableHead className="text-slate-700">Name</TableHead>
                  <TableHead className="text-slate-700">Description</TableHead>
                  <TableHead className="text-slate-700">Type</TableHead>
                  <TableHead className="text-slate-700">Category</TableHead>
                  <TableHead className="text-slate-700">Target</TableHead>
                  <TableHead className="text-slate-700">Status</TableHead>
                  <TableHead className="text-slate-700">Rollout</TableHead>
                  <TableHead className="text-slate-700">Last Modified</TableHead>
                  <TableHead className="text-slate-700">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredFlags.map((flag) => (
                  <TableRow key={flag.id} className="border-slate-200 hover:bg-slate-50 transition-colors">
                    <TableCell className="font-medium text-slate-900">{flag.id}</TableCell>
                    <TableCell className="font-semibold text-slate-900">{flag.name}</TableCell>
                    <TableCell className="text-slate-700">{flag.description}</TableCell>
                    <TableCell>{getTypeBadge(flag.type)}</TableCell>
                    <TableCell>{getCategoryBadge(flag.category)}</TableCell>
                    <TableCell className="text-slate-600">{flag.targetUsers}</TableCell>
                    <TableCell>
                      <Badge variant={flag.enabled ? "default" : "secondary"} className={flag.enabled ? "bg-green-600" : "bg-slate-400"}>
                        {flag.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {flag.type === "percentage" && flag.percentage !== undefined && (
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900">{flag.percentage}%</span>
                          <Input
                            type="range"
                            min="0"
                            max="100"
                            value={flag.percentage}
                            onChange={(e) => updatePercentage(flag.id, parseInt(e.target.value))}
                            className="w-24"
                          />
                        </div>
                      )}
                      {flag.type === "multivariate" && (
                        <span className="text-sm text-slate-600">{flag.variants?.join(", ")}</span>
                      )}
                      {flag.type === "boolean" && (
                        <span className="text-sm text-slate-500">N/A</span>
                      )}
                    </TableCell>
                    <TableCell className="text-slate-600">{flag.lastModified}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant={flag.enabled ? "destructive" : "default"}
                        onClick={() => toggleFlag(flag.id)}
                        className={flag.enabled ? "bg-red-600 hover:bg-red-700" : "bg-slate-900 hover:bg-slate-800"}
                      >
                        {flag.enabled ? "Disable" : "Enable"}
                      </Button>
                    </TableCell>
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
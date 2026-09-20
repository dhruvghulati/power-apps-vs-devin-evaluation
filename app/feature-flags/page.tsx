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
        return <Badge className="badge-info border-0">Boolean</Badge>
      case "percentage":
        return <Badge className="badge-success border-0">Percentage</Badge>
      case "multivariate":
        return <Badge className="badge-warning border-0">Multivariate</Badge>
      default:
        return <Badge variant="outline">{type}</Badge>
    }
  }

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case "product":
        return <Badge className="badge-success border-0">Product</Badge>
      case "infrastructure":
        return <Badge className="badge-warning border-0">Infrastructure</Badge>
      case "compliance":
        return <Badge className="badge-error border-0">Compliance</Badge>
      case "user-experience":
        return <Badge className="badge-info border-0">UX</Badge>
      default:
        return <Badge variant="outline">{category}</Badge>
    }
  }

  return (
    <div className="min-h-screen fintech-gradient">
      <div className="container mx-auto px-6 py-8 max-w-7xl">
        {/* Header */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gradient mb-2">Feature Flags Dashboard</h1>
            <p className="text-muted-foreground text-base">Manage feature rollouts and experiments</p>
          </div>
          <div className="flex flex-wrap gap-3 items-center">
            {/* Navigation Links */}
            <nav className="hidden lg:flex gap-2">
              <Link href="/kyc" className="inline-flex items-center px-4 py-2.5 bg-white/80 backdrop-blur-sm border border-border rounded-lg hover:bg-white hover:shadow-sm transition-all text-sm font-medium">
                KYC Queue
              </Link>
              <Link href="/data-connections" className="inline-flex items-center px-4 py-2.5 bg-white/80 backdrop-blur-sm border border-border rounded-lg hover:bg-white hover:shadow-sm transition-all text-sm font-medium">
                Data Connections
              </Link>
              <Link href="/compliance" className="inline-flex items-center px-4 py-2.5 bg-white/80 backdrop-blur-sm border border-border rounded-lg hover:bg-white hover:shadow-sm transition-all text-sm font-medium">
                Compliance
              </Link>
              <Link href="/audit-logs" className="inline-flex items-center px-4 py-2.5 bg-white/80 backdrop-blur-sm border border-border rounded-lg hover:bg-white hover:shadow-sm transition-all text-sm font-medium">
                Audit Logs
              </Link>
              <Link href="/" className="inline-flex items-center px-4 py-2.5 bg-white/80 backdrop-blur-sm border border-border rounded-lg hover:bg-white hover:shadow-sm transition-all text-sm font-medium">
                Refunds
              </Link>
            </nav>
            
            {/* User Info & Role Switcher */}
            <div className="flex items-center gap-3 border-l border-border pl-3">
              <div className="text-sm text-right">
                <div className="font-semibold text-foreground">{currentUser.name}</div>
                <div className="text-muted-foreground text-xs">{currentUser.roles[0]} • {currentUser.department}</div>
              </div>
              <Select value={currentUser.id} onValueChange={(value) => { if (value) switchUser(value) }}>
                <SelectTrigger className="w-[140px] h-9 text-sm border-border bg-white/80 backdrop-blur-sm">
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
            
            <Button 
              className="button-hover h-9 px-4 text-sm font-medium"
              disabled={!hasPermission(currentUser, 'flag:create')}
            >
              + New Flag
            </Button>
          </div>
        </div>

        {/* Compliance Status Banner */}
        <div className="bg-white/80 backdrop-blur-sm border border-border rounded-xl p-4 mb-8 card-shadow">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Compliance Status:</span>
            <Badge className="badge-success border-0">SOC2 Ready</Badge>
            <Badge className="badge-info border-0">SoD Enforced</Badge>
            <Badge className="badge-info border-0">Audit Trail: Immutable</Badge>
            <Badge className="badge-info border-0">AES-256 Encrypted</Badge>
            <Badge className="badge-info border-0">TLS 1.3</Badge>
            <Badge className="badge-info border-0">PII Masking</Badge>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
          <Card className="card-shadow border-border hover:card-shadow-hover transition-shadow bg-white/80 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Total Flags</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{stats.total}</div>
            </CardContent>
          </Card>
          <Card className="card-shadow border-border hover:card-shadow-hover transition-shadow bg-white/80 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Enabled</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{stats.enabled}</div>
            </CardContent>
          </Card>
          <Card className="card-shadow border-border hover:card-shadow-hover transition-shadow bg-white/80 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Disabled</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-muted-foreground">{stats.disabled}</div>
            </CardContent>
          </Card>
          <Card className="card-shadow border-border hover:card-shadow-hover transition-shadow bg-white/80 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Percentage Flags</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">{stats.percentageFlags}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="card-shadow border-border mb-8 bg-white/80 backdrop-blur-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold">Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <Input
                  placeholder="Search by name or description..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="input-focus border-border bg-white/50"
                />
              </div>
              <Select value={filterType} onValueChange={(value) => setFilterType(value || 'all')}>
                <SelectTrigger className="w-[180px] border-border bg-white/50 input-focus">
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
                <SelectTrigger className="w-[180px] border-border bg-white/50 input-focus">
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
        <Card className="card-shadow border-border bg-white/80 backdrop-blur-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold">Feature Flags ({filteredFlags.length})</CardTitle>
            <CardDescription className="text-sm">Control feature rollouts and experiments</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-border bg-muted/30">
                  <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">ID</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Name</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Description</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Category</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Target</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Rollout</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Last Modified</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredFlags.map((flag) => (
                  <TableRow key={flag.id} className="border-border table-row-hover">
                    <TableCell className="font-medium text-foreground text-sm">{flag.id}</TableCell>
                    <TableCell className="font-semibold text-foreground text-sm">{flag.name}</TableCell>
                    <TableCell className="text-foreground text-sm">{flag.description}</TableCell>
                    <TableCell>{getTypeBadge(flag.type)}</TableCell>
                    <TableCell>{getCategoryBadge(flag.category)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{flag.targetUsers}</TableCell>
                    <TableCell>
                      <Badge variant={flag.enabled ? "default" : "secondary"} className={flag.enabled ? "badge-success border-0" : "bg-muted text-muted-foreground border-0"}>
                        {flag.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {flag.type === "percentage" && flag.percentage !== undefined && (
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground text-sm">{flag.percentage}%</span>
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
                        <span className="text-sm text-muted-foreground">{flag.variants?.join(", ")}</span>
                      )}
                      {flag.type === "boolean" && (
                        <span className="text-sm text-muted-foreground">N/A</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{flag.lastModified}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant={flag.enabled ? "destructive" : "default"}
                        onClick={() => toggleFlag(flag.id)}
                        className={flag.enabled ? "button-hover bg-red-600 hover:bg-red-700 h-8 px-3 text-xs" : "button-hover h-8 px-3 text-xs"}
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
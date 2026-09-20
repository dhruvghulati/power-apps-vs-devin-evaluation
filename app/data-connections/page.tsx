"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getCurrentUser, hasPermission } from "@/lib/rbac"

interface DataSource {
  id: string
  name: string
  type: "azure-sql" | "postgresql" | "snowflake" | "bigquery" | "redshift" | "mysql"
  status: "connected" | "disconnected" | "error"
  lastSync?: string
  tables: number
  rows: number
  description: string
  icon: string
}

const mockDataSources: DataSource[] = [
  {
    id: "ds-001",
    name: "Azure SQL Data Warehouse",
    type: "azure-sql",
    status: "connected",
    lastSync: "2026-01-20 14:30:00",
    tables: 12,
    rows: 2450000,
    description: "Production Azure SQL warehouse for refunds and transactions",
    icon: "🔷"
  },
  {
    id: "ds-002",
    name: "PostgreSQL - KYC Documents",
    type: "postgresql",
    status: "connected",
    lastSync: "2026-01-20 14:30:00",
    tables: 8,
    rows: 156000,
    description: "KYC document metadata and customer records",
    icon: "🐘"
  },
  {
    id: "ds-003",
    name: "Snowflake - Analytics",
    type: "snowflake",
    status: "disconnected",
    tables: 24,
    rows: 12500000,
    description: "Snowflake data warehouse for analytics and reporting",
    icon: "❄️"
  },
  {
    id: "ds-004",
    name: "BigQuery - Risk Analytics",
    type: "bigquery",
    status: "connected",
    lastSync: "2026-01-20 14:30:00",
    tables: 15,
    rows: 8900000,
    description: "Google BigQuery for risk scoring and fraud detection",
    icon: "📊"
  },
  {
    id: "ds-005",
    name: "Redshift - Transaction History",
    type: "redshift",
    status: "error",
    tables: 18,
    rows: 3200000,
    description: "AWS Redshift for long-term transaction history",
    icon: "🔴"
  },
  {
    id: "ds-006",
    name: "MySQL - Legacy Systems",
    type: "mysql",
    status: "connected",
    lastSync: "2026-01-20 14:30:00",
    tables: 6,
    rows: 89000,
    description: "MySQL database for legacy application data",
    icon: "🐬"
  }
]

export default function DataConnections() {
  const [dataSources, setDataSources] = useState<DataSource[]>(mockDataSources)
  const [selectedSource, setSelectedSource] = useState<DataSource | null>(null)
  const [currentUser, setCurrentUserState] = useState(getCurrentUser())

  const getTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      'azure-sql': 'badge-info border-0',
      'postgresql': 'badge-success border-0',
      'snowflake': 'badge-info border-0',
      'bigquery': 'badge-warning border-0',
      'redshift': 'badge-error border-0',
      'mysql': 'badge-warning border-0'
    }
    return colors[type] || 'badge-info border-0'
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'connected':
        return <Badge className="badge-success border-0">Connected</Badge>
      case 'disconnected':
        return <Badge className="badge-warning border-0">Disconnected</Badge>
      case 'error':
        return <Badge className="badge-error border-0">Error</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const handleConnect = (sourceId: string) => {
    if (!hasPermission(currentUser, 'admin:write')) {
      alert('You do not have permission to manage data connections.')
      return
    }
    
    setDataSources(dataSources.map(source => 
      source.id === sourceId 
        ? { ...source, status: 'connected', lastSync: new Date().toISOString().replace('T', ' ').split('.')[0] }
        : source
    ))
  }

  const handleDisconnect = (sourceId: string) => {
    if (!hasPermission(currentUser, 'admin:write')) {
      alert('You do not have permission to manage data connections.')
      return
    }
    
    setDataSources(dataSources.map(source => 
      source.id === sourceId 
        ? { ...source, status: 'disconnected', lastSync: undefined }
        : source
    ))
  }

  const handleSync = (sourceId: string) => {
    if (!hasPermission(currentUser, 'admin:write')) {
      alert('You do not have permission to sync data.')
      return
    }
    
    setDataSources(dataSources.map(source => 
      source.id === sourceId 
        ? { ...source, lastSync: new Date().toISOString().replace('T', ' ').split('.')[0] }
        : source
    ))
  }

  return (
    <div className="min-h-screen fintech-gradient">
      <div className="container mx-auto px-6 py-8 max-w-7xl">
        {/* Header */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gradient mb-2">Data Connections</h1>
            <p className="text-muted-foreground text-base">Connect to existing data warehouses and data streams</p>
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
              <Link href="/audit-logs" className="inline-flex items-center px-4 py-2.5 bg-white/80 backdrop-blur-sm border border-border rounded-lg hover:bg-white hover:shadow-sm transition-all text-sm font-medium">
                Audit Logs
              </Link>
            </nav>
            
            {/* User Info & Role Switcher */}
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
            <Badge className="badge-info border-0">SoD Enforced</Badge>
            <Badge className="badge-info border-0">Audit Trail: Immutable</Badge>
            <Badge className="badge-info border-0">AES-256 Encrypted</Badge>
            <Badge className="badge-info border-0">TLS 1.3</Badge>
          </div>
        </div>

        {/* MCP Integration Banner */}
        <div className="bg-white/80 backdrop-blur-sm border border-border rounded-xl p-4 mb-8 card-shadow">
          <div className="flex items-start gap-4">
            <div className="text-4xl">🔌</div>
            <div className="flex-1">
              <h3 className="font-semibold text-foreground mb-1">MCP-Based Data Connectivity</h3>
              <p className="text-sm text-muted-foreground">
                Devin uses Model Context Protocol (MCP) to connect to PostgreSQL, SQL Server, Snowflake, BigQuery, Redshift, and MySQL.
                Connectors provide natural language querying and schema introspection capabilities.
              </p>
            </div>
            <div className="flex gap-2">
              <Badge className="badge-info border-0">PostgreSQL</Badge>
              <Badge className="badge-info border-0">SQL Server</Badge>
              <Badge className="badge-info border-0">Snowflake</Badge>
              <Badge className="badge-info border-0">BigQuery</Badge>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-8">
          <Card className="card-shadow border-border hover:card-shadow-hover transition-shadow bg-white/80 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Total Sources</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{dataSources.length}</div>
            </CardContent>
          </Card>
          <Card className="card-shadow border-border hover:card-shadow-hover transition-shadow bg-white/80 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Connected</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{dataSources.filter(s => s.status === 'connected').length}</div>
            </CardContent>
          </Card>
          <Card className="card-shadow border-border hover:card-shadow-hover transition-shadow bg-white/80 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Total Tables</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{dataSources.reduce((sum, s) => sum + s.tables, 0)}</div>
            </CardContent>
          </Card>
          <Card className="card-shadow border-border hover:card-shadow-hover transition-shadow bg-white/80 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Total Rows</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{(dataSources.reduce((sum, s) => sum + s.rows, 0) / 1000000).toFixed(1)}M</div>
            </CardContent>
          </Card>
        </div>

        {/* Data Sources Table */}
        <Card className="card-shadow border-border mb-8 bg-white/80 backdrop-blur-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold">Data Sources</CardTitle>
            <CardDescription>MCP-based connectors to data warehouses and databases</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="text-foreground">Source</TableHead>
                  <TableHead className="text-foreground">Type</TableHead>
                  <TableHead className="text-foreground">Status</TableHead>
                  <TableHead className="text-foreground">Tables</TableHead>
                  <TableHead className="text-foreground">Rows</TableHead>
                  <TableHead className="text-foreground">Last Sync</TableHead>
                  <TableHead className="text-foreground">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dataSources.map((source) => (
                  <TableRow key={source.id} className="border-border hover:bg-white/50 transition-colors">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="text-2xl">{source.icon}</div>
                        <div>
                          <div className="font-medium text-foreground">{source.name}</div>
                          <div className="text-xs text-muted-foreground">{source.description}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getTypeBadge(source.type)}>
                        {source.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(source.status)}
                    </TableCell>
                    <TableCell className="text-foreground">{source.tables}</TableCell>
                    <TableCell className="text-foreground">{source.rows.toLocaleString()}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {source.lastSync || '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {source.status === 'connected' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleSync(source.id)}
                              className="border-border h-8 text-xs"
                            >
                              Sync
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDisconnect(source.id)}
                              className="border-border h-8 text-xs"
                            >
                              Disconnect
                            </Button>
                          </>
                        )}
                        {source.status === 'disconnected' && (
                          <Button
                            size="sm"
                            onClick={() => handleConnect(source.id)}
                            className="button-hover h-8 text-xs"
                          >
                            Connect
                          </Button>
                        )}
                        {source.status === 'error' && (
                          <Button
                            size="sm"
                            onClick={() => handleConnect(source.id)}
                            className="button-hover h-8 text-xs"
                          >
                            Retry
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Integration Comparison */}
        <Card className="card-shadow border-border bg-white/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Data Integration Comparison: Devin vs Power Apps</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold text-foreground mb-3">Devin MCP-Based Connectivity</h4>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <span className="text-green-500 mt-1">✓</span>
                      <span><strong>PostgreSQL</strong> - Native connector with schema introspection</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-green-500 mt-1">✓</span>
                      <span><strong>SQL Server/Azure SQL</strong> - Via CData Connect AI or direct MCP</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-green-500 mt-1">✓</span>
                      <span><strong>Snowflake</strong> - Native connector with natural language queries</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-green-500 mt-1">✓</span>
                      <span><strong>BigQuery</strong> - Native connector for analytics</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-green-500 mt-1">✓</span>
                      <span><strong>Redshift</strong> - Native connector for AWS data warehouses</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-green-500 mt-1">✓</span>
                      <span><strong>MySQL</strong> - Native connector for legacy systems</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-green-500 mt-1">✓</span>
                      <span><strong>Natural Language Queries</strong> - AI-powered data query capabilities</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-green-500 mt-1">✓</span>
                      <span><strong>Cross-Source Queries</strong> - Query across multiple data sources</span>
                    </li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-foreground mb-3">Power Apps Data Connectivity</h4>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <span className="text-green-500 mt-1">✓</span>
                      <span><strong>SQL Server Connector</strong> - Native Azure SQL support</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-green-500 mt-1">✓</span>
                      <span><strong>Virtual Tables</strong> - Data appears without being stored</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-green-500 mt-1">✓</span>
                      <span><strong>Microsoft Ecosystem</strong> - Deep Azure integration</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-orange-500 mt-1">!</span>
                      <span><strong>Azure Synapse Limitations</strong> - CRUD not fully supported</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-orange-500 mt-1">!</span>
                      <span><strong>Ecosystem Lock-in</strong> - Limited to Microsoft stack</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-orange-500 mt-1">!</span>
                      <span><strong>No Natural Language Queries</strong> - Requires SQL expertise</span>
                    </li>
                  </ul>
                </div>
              </div>
              
              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <h4 className="font-semibold text-foreground mb-2">Azure SQL Warehouse Integration</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  For Azure-centric organizations, Devin can connect to Azure SQL Data Warehouse through:
                </p>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>• <strong>Direct MCP</strong> - Native SQL Server connector</li>
                  <li>• <strong>CData Connect AI</strong> - AI-powered virtualization layer</li>
                  <li>• <strong>VNET Integration</strong> - Private network access for Azure resources</li>
                  <li>• <strong>Entra ID Authentication</strong> - Seamless Microsoft identity integration</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
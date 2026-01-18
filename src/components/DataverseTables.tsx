import { useState, useEffect } from 'react'
import { useDataverseToken } from '@/hooks/useDataverseToken'
import { dataverseApi, type DataverseTableDefinition } from '@/lib/dataverseApi'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export function DataverseTables() {
  const { getAccessToken, isLoading: tokenLoading, error: tokenError } = useDataverseToken()
  const [tables, setTables] = useState<DataverseTableDefinition[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [selectedTable, setSelectedTable] = useState<DataverseTableDefinition | null>(null)
  const [testData, setTestData] = useState<any[]>([])
  const [whoAmIResult, setWhoAmIResult] = useState<any>(null)
  const [testingAuth, setTestingAuth] = useState(false)

  const testConnection = async () => {
    setTestingAuth(true)
    setError(null)

    try {
      const token = await getAccessToken()
      if (!token) {
        throw new Error('Failed to get access token')
      }

      const whoAmI = await dataverseApi.whoAmI(token)
      const testQuery = await dataverseApi.queryTable(token, 'activitymimeattachments', '$top=10')
      
      setWhoAmIResult(whoAmI)
      setTestData(testQuery)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Connection test failed'))
    } finally {
      setTestingAuth(false)
    }
  }

  const fetchTables = async () => {
    setLoading(true)
    setError(null)

    try {
      const token = await getAccessToken()
      if (!token) {
        throw new Error('Failed to get access token')
      }

      const tableDefinitions = await dataverseApi.getTableDefinitions(token)
      setTables(tableDefinitions)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch tables'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (tokenError) {
      setError(tokenError)
    }
  }, [tokenError])

  if (loading || testingAuth) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <div className="flex flex-col items-center gap-2">
            <Spinner className="size-8" />
            <p className="text-sm text-muted-foreground">
              {testingAuth ? 'Testing connection...' : 'Loading...'}
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Error</CardTitle>
          <CardDescription>{error.message}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={fetchTables}>Retry</Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>PowerApps Dataverse Tables</CardTitle>
              <CardDescription>View and explore table definitions from your Dataverse environment</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button onClick={testConnection} disabled={loading || testingAuth || tokenLoading} variant="outline">
                Test Connection
              </Button>
              <Button onClick={fetchTables} disabled={loading || tokenLoading}>
                {tables.length > 0 ? 'Refresh' : 'Load Tables'}
              </Button>
            </div>
          </div>
        </CardHeader>
        {(whoAmIResult || testData.length > 0) && (
          <CardContent>
            <div className="space-y-4">
              {whoAmIResult && (
                <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-md border border-green-200 dark:border-green-900">
                  <p className="text-sm font-semibold text-green-900 dark:text-green-100 mb-2">✅ Authentication Successful</p>
                  <div className="text-xs text-green-700 dark:text-green-300 space-y-1">
                    <p><span className="font-medium">User ID:</span> {whoAmIResult.UserId}</p>
                    <p><span className="font-medium">Business Unit ID:</span> {whoAmIResult.BusinessUnitId}</p>
                    <p><span className="font-medium">Organization ID:</span> {whoAmIResult.OrganizationId}</p>
                  </div>
                </div>
              )}
              {testData.length > 0 && (
                <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-md border border-blue-200 dark:border-blue-900">
                  <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
                    ✅ Query Successful: activitymimeattachments?$top=10
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-300 mb-3">
                    Found {testData.length} record{testData.length !== 1 ? 's' : ''}
                  </p>
                  {testData.length > 0 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer font-medium text-blue-900 dark:text-blue-100 hover:underline">
                        View Sample Data ({testData.length} {testData.length === 1 ? 'record' : 'records'})
                      </summary>
                      <div className="mt-2 p-2 bg-white dark:bg-gray-900 rounded border max-h-96 overflow-auto">
                        <pre className="text-xs whitespace-pre-wrap break-words">
                          {JSON.stringify(testData.slice(0, 3), null, 2)}
                          {testData.length > 3 && `\n... and ${testData.length - 3} more record(s)`}
                        </pre>
                      </div>
                    </details>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        )}
        {tables.length > 0 && (
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Display Name</TableHead>
                    <TableHead>Logical Name</TableHead>
                    <TableHead>Entity Set</TableHead>
                    <TableHead>Primary ID</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tables.map((table) => {
                    const displayName = typeof table.DisplayName === 'string' 
                      ? table.DisplayName 
                      : table.DisplayName?.UserLocalizedLabel?.Label || table.LogicalName
                    
                    return (
                      <TableRow key={table.LogicalName}>
                        <TableCell className="font-medium">{displayName}</TableCell>
                        <TableCell className="font-mono text-sm">{table.LogicalName}</TableCell>
                        <TableCell className="font-mono text-sm">{table.EntitySetName}</TableCell>
                        <TableCell className="font-mono text-sm">{table.PrimaryIdAttribute}</TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedTable(table)}
                          >
                            View Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        )}
      </Card>

      {selectedTable && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>
                  {typeof selectedTable.DisplayName === 'string'
                    ? selectedTable.DisplayName
                    : selectedTable.DisplayName?.UserLocalizedLabel?.Label || selectedTable.LogicalName}
                </CardTitle>
                <CardDescription>
                  {typeof selectedTable.Description === 'string'
                    ? selectedTable.Description
                    : selectedTable.Description?.UserLocalizedLabel?.Label || 'No description'}
                </CardDescription>
              </div>
              <Button variant="ghost" onClick={() => setSelectedTable(null)}>
                Close
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">Table Information</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Logical Name:</span>
                    <p className="font-mono">{selectedTable.LogicalName}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Entity Set:</span>
                    <p className="font-mono">{selectedTable.EntitySetName}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Primary ID:</span>
                    <p className="font-mono">{selectedTable.PrimaryIdAttribute}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Primary Name:</span>
                    <p className="font-mono">{selectedTable.PrimaryNameAttribute || 'N/A'}</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

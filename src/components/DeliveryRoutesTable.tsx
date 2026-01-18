import { useState, useEffect, useMemo, useCallback } from 'react'
import { useDataverseToken } from '@/hooks/useDataverseToken'
import { dataverseApi, type DataverseResponse } from '@/lib/dataverseApi'
import { type PsDeliveryroutes, psdeliveryroutesEntitySet } from '@/types/dataverse'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import { RouteDetailView } from '@/components/RouteDetailView'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { TrashIcon } from 'lucide-react'
import { toast } from 'sonner'

const ITEMS_PER_PAGE = 10

interface RouteGroup {
  id: string
  vehicleName: string | null
  createdon: string
  routes: PsDeliveryroutes[]
  stopCount: number
}

function groupRoutes(routes: PsDeliveryroutes[]): RouteGroup[] {
  const groups = new Map<string, RouteGroup>()

  for (const route of routes) {
    const vehicleName = route.ps_vehiclename || ''
    const createdon = route.createdon || ''
    
    const createdDate = createdon ? new Date(createdon) : new Date(0)
    const timeKey = createdDate.getTime()
    
    const groupKey = `${vehicleName}_${timeKey}`
    
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        id: groupKey,
        vehicleName: route.ps_vehiclename ?? null,
        createdon: route.createdon ?? '',
        routes: [],
        stopCount: 0,
      })
    }
    
    const group = groups.get(groupKey)!
    group.routes.push(route)
    group.stopCount = group.routes.length
  }

  return Array.from(groups.values()).sort((a, b) => {
    const dateA = a.createdon ? new Date(a.createdon).getTime() : 0
    const dateB = b.createdon ? new Date(b.createdon).getTime() : 0
    return dateB - dateA
  })
}

export function DeliveryRoutesTable() {
  const { getAccessToken, isLoading: tokenLoading, error: tokenError } = useDataverseToken()
  const [data, setData] = useState<PsDeliveryroutes[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedRouteGroup, setSelectedRouteGroup] = useState<RouteGroup | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [routeGroupToDelete, setRouteGroupToDelete] = useState<RouteGroup | null>(null)
  const [deleting, setDeleting] = useState(false)

  const routeGroups = useMemo(() => {
    return groupRoutes(data)
  }, [data])

  const fetchAllDeliveryRoutes = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const token = await getAccessToken()
      if (!token) {
        throw new Error('Failed to get access token')
      }

      const allRoutes: PsDeliveryroutes[] = []
      let url: string | undefined = 'https://pacerprojects.crm6.dynamics.com/api/data/v9.2/ps_deliveryrouteses?$select=ps_deliveryroutesid,ps_sequence,ps_sitelat,ps_sitelong,ps_vehiclename,createdon,modifiedon,statecode,statuscode&$orderby=createdon desc'

      while (url) {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
            'OData-MaxVersion': '4.0',
            'OData-Version': '4.0',
            'Prefer': 'odata.include-annotations="*"',
          },
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`API error: ${response.status} ${response.statusText}. ${errorText}`)
        }

        const result = await response.json() as DataverseResponse<PsDeliveryroutes>
        
        if (result.value) {
          allRoutes.push(...result.value)
        }

        url = result['@odata.nextLink'] || undefined
      }

      setData(allRoutes)
    } catch (err) {
      const fetchError = err instanceof Error ? err : new Error('Failed to fetch delivery routes')
      setError(fetchError)
    } finally {
      setLoading(false)
    }
  }, [getAccessToken])

  useEffect(() => {
    if (tokenError) {
      const err = tokenError instanceof Error ? tokenError : new Error(String(tokenError))
      setError(err)
    }
  }, [tokenError])

  useEffect(() => {
    if (!tokenLoading && !tokenError) {
      void fetchAllDeliveryRoutes()
    }
  }, [tokenLoading, tokenError, fetchAllDeliveryRoutes])

  const totalPages = Math.ceil(routeGroups.length / ITEMS_PER_PAGE)
  const paginatedGroups = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
    const endIndex = startIndex + ITEMS_PER_PAGE
    return routeGroups.slice(startIndex, endIndex)
  }, [routeGroups, currentPage])

  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return '-'
    try {
      return new Date(dateString).toLocaleString()
    } catch {
      return dateString
    }
  }

  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = []
    const maxVisible = 5

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i)
      }
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) {
          pages.push(i)
        }
        pages.push('ellipsis')
        pages.push(totalPages)
      } else if (currentPage >= totalPages - 2) {
        pages.push(1)
        pages.push('ellipsis')
        for (let i = totalPages - 3; i <= totalPages; i++) {
          pages.push(i)
        }
      } else {
        pages.push(1)
        pages.push('ellipsis')
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i)
        }
        pages.push('ellipsis')
        pages.push(totalPages)
      }
    }

    return pages
  }

  const handleRouteClick = (group: RouteGroup) => {
    setSelectedRouteGroup(group)
  }

  const handleDeleteClick = (e: React.MouseEvent, group: RouteGroup) => {
    e.stopPropagation()
    setRouteGroupToDelete(group)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = useCallback(async () => {
    if (!routeGroupToDelete || deleting) return

    setDeleting(true)
    setError(null)
    
    try {
      const token = await getAccessToken()
      if (!token) {
        throw new Error('Failed to get access token')
      }

      const deletePromises = routeGroupToDelete.routes.map((route) =>
        route.ps_deliveryroutesid
          ? dataverseApi.deleteRecord(token, psdeliveryroutesEntitySet, route.ps_deliveryroutesid)
          : Promise.resolve()
      )

      await Promise.all(deletePromises)
      
      toast.success('Route deleted successfully', {
        description: `Deleted ${routeGroupToDelete.stopCount} stop${routeGroupToDelete.stopCount !== 1 ? 's' : ''}`,
      })
      
      setDeleteDialogOpen(false)
      setRouteGroupToDelete(null)
      setError(null)
      
      await fetchAllDeliveryRoutes()
    } catch (err) {
      const deleteErr: Error = err instanceof Error ? err : new Error('Failed to delete delivery routes')
      setError(deleteErr)
      toast.error('Failed to delete route', {
        description: deleteErr.message,
      })
    } finally {
      setDeleting(false)
    }
  }, [routeGroupToDelete, deleting, getAccessToken, fetchAllDeliveryRoutes])

  const getErrorMessage = (err: Error | null): string | null => {
    if (!err) return null
    if (err instanceof Error) return err.message
    return String(err)
  }

  if (selectedRouteGroup) {
    return <RouteDetailView routes={selectedRouteGroup.routes} onBack={() => setSelectedRouteGroup(null)} />
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <div className="flex flex-col items-center gap-2">
            <Spinner className="size-8" />
            <p className="text-sm text-muted-foreground">Loading delivery routes...</p>
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
          <Button onClick={() => { void fetchAllDeliveryRoutes() }}>Retry</Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Delivery Routes</CardTitle>
              <CardDescription>
                {routeGroups.length} route{routeGroups.length !== 1 ? 's' : ''} found
              </CardDescription>
            </div>
            <Button onClick={() => { void fetchAllDeliveryRoutes() }} variant="outline" disabled={loading || deleting}>
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {routeGroups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No delivery routes found
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vehicle Name</TableHead>
                      <TableHead>Stops</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedGroups.map((group) => {
                      const isActive = group.routes.some((r) => r.statecode === 0)
                      return (
                        <TableRow
                          key={group.id}
                          className={`cursor-pointer hover:bg-muted/50 ${deleting || loading ? 'opacity-50 pointer-events-none' : ''}`}
                          onClick={() => {
                            if (!deleting && !loading) {
                              handleRouteClick(group)
                            }
                          }}
                        >
                          <TableCell className="font-medium">
                            {group.vehicleName || 'Not specified'}
                          </TableCell>
                          <TableCell>{group.stopCount}</TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                              isActive
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
                            }`}>
                              {isActive ? 'Active' : 'Inactive'}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(group.createdon)}
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => handleDeleteClick(e, group)}
                              disabled={deleting || loading}
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive disabled:opacity-50"
                            >
                              <TrashIcon className="size-4" />
                              <span className="sr-only">Delete</span>
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        onClick={(e) => {
                          e.preventDefault()
                          setCurrentPage((prev) => Math.max(1, prev - 1))
                        }}
                        className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                      />
                    </PaginationItem>
                    {getPageNumbers().map((page, index) => (
                      <PaginationItem key={index}>
                        {page === 'ellipsis' ? (
                          <PaginationEllipsis />
                        ) : (
                          <PaginationLink
                            href="#"
                            onClick={(e) => {
                              e.preventDefault()
                              setCurrentPage(page)
                            }}
                            isActive={currentPage === page}
                            className="cursor-pointer"
                          >
                            {page}
                          </PaginationLink>
                        )}
                      </PaginationItem>
                    ))}
                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        onClick={(e) => {
                          e.preventDefault()
                          setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                        }}
                        className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              )}

              <div className="text-sm text-muted-foreground text-center">
                Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, routeGroups.length)} of {routeGroups.length} routes
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog 
        open={deleteDialogOpen} 
        onOpenChange={(open) => {
          if (!deleting && !open) {
            setDeleteDialogOpen(false)
            setRouteGroupToDelete(null)
            setError(null)
          }
        }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Delivery Route</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                Are you sure you want to delete this route group with {routeGroupToDelete?.stopCount} stop{routeGroupToDelete?.stopCount !== 1 ? 's' : ''}? This action cannot be undone.
              </p>
              {routeGroupToDelete && (
                <div className="mt-2 rounded-md bg-muted p-3 text-sm space-y-1">
                  <div><strong>Vehicle:</strong> {routeGroupToDelete.vehicleName || 'Not specified'}</div>
                  <div><strong>Stops:</strong> {routeGroupToDelete.stopCount}</div>
                  <div><strong>Created:</strong> {formatDate(routeGroupToDelete.createdon)}</div>
                </div>
              )}
              {deleting && (
                <div className="mt-3 flex items-center gap-2 text-sm">
                  <Spinner className="size-4" />
                  <span>Deleting route and refreshing data...</span>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {getErrorMessage(error) && (
            <div className="mx-6 rounded-md bg-destructive/10 p-3 text-sm text-destructive border border-destructive/20">
              {getErrorMessage(error)}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel 
              disabled={deleting}
              onClick={() => {
                if (!deleting) {
                  setDeleteDialogOpen(false)
                  setRouteGroupToDelete(null)
                  setError(null)
                }
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void handleDeleteConfirm()
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deleting ? (
                <>
                  <Spinner className="mr-2 size-4" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

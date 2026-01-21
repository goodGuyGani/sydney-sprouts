import { useState, useEffect, useMemo, useCallback, startTransition } from 'react'
import { useDataverseToken } from '@/hooks/useDataverseToken'
import { dataverseApi, type DataverseResponse } from '@/lib/dataverseApi'
import { type PsDeliveryroutes, psdeliveryroutesEntitySet, type PsVehicledatabase, psvehicledatabaseEntitySet } from '@/types/dataverse'
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
import { RouteDetailsP2 } from '@/components/RouteDetailsP2'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Trash2, AlertTriangle, Loader2, X, Truck, MapPin, Calendar } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'

const ITEMS_PER_PAGE = 10

interface RouteGroup {
  id: string
  vehicleName: string | null
  createdon: string
  routes: PsDeliveryroutes[]
  stopCount: number
}

function groupRoutes(routes: PsDeliveryroutes[], vehicleMap: Map<string, string>): RouteGroup[] {
  const groups = new Map<string, RouteGroup>()

  for (const route of routes) {
    const routeGroupId = route.ps_routegroupid || route.ps_routename || ''
    const routeDate = route.ps_route_date || route.createdon || ''
    
    const groupKey = routeGroupId || `${route.ps_vehicle_route || route.ps_vehiclename || ''}_${routeDate}`
    
    if (!groups.has(groupKey)) {
      let vehicleName: string | null = null
      if (route.ps_vehicle_route && vehicleMap.has(route.ps_vehicle_route)) {
        vehicleName = vehicleMap.get(route.ps_vehicle_route) || null
      } else if (route.ps_vehiclename) {
        vehicleName = route.ps_vehiclename
      }
      
      groups.set(groupKey, {
        id: groupKey,
        vehicleName,
        createdon: (route.ps_route_date || route.createdon) ?? '',
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
  const [vehicles, setVehicles] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedRouteGroup, setSelectedRouteGroup] = useState<RouteGroup | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [routeGroupToDelete, setRouteGroupToDelete] = useState<RouteGroup | null>(null)
  const [deleting, setDeleting] = useState(false)

  const routeGroups = useMemo(() => {
    return groupRoutes(data, vehicles)
  }, [data, vehicles])

  const fetchAllDeliveryRoutes = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const token = await getAccessToken()
      if (!token) {
        throw new Error('Failed to get access token')
      }

      const allRoutes: PsDeliveryroutes[] = []
      const selectFields = [
        'ps_deliveryroutesid',
        'ps_sequence',
        'ps_sitelat',
        'ps_sitelong',
        'ps_vehiclename',
        'ps_vehicle_route',
        'ps_routegroupid',
        'ps_routename',
        'ps_route_date',
        'ps_driver_name',
        'ps_driver',
        'ps_territorygroup',
        'ps_plannedstarttime',
        'ps_plannedendtime',
        'ps_estimateddistance',
        'ps_estimatedduration',
        'ps_actualstarttime',
        'ps_actualendtime',
        'ps_capacityusage',
        'ps_account',
        'ps_address',
        'ps_contactname',
        'ps_contactphone',
        'ps_orderpriority',
        'ps_actualdeliverytime',
        'ps_deliveredby',
        'ps_deliveryconfirmationstatus',
        'ps_drivernotes',
        'ps_hasphoto',
        'createdon',
        'modifiedon',
        'statecode',
        'statuscode'
      ].filter(Boolean).join(',')
      let url: string | undefined = `https://pacerprojects.crm6.dynamics.com/api/data/v9.2/ps_deliveryrouteses?$select=${selectFields}&$orderby=ps_route_date desc,ps_routegroupid,ps_sequence`

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
          let errorJson: { error?: { code?: string; message?: string } }
          try {
            errorJson = JSON.parse(errorText) as { error?: { code?: string; message?: string } }
          } catch {
            errorJson = {}
          }
          
          if (errorJson.error?.code === '0x80060888' && typeof errorJson.error.message === 'string') {
            const matchResult = errorJson.error.message.match(/property named '([^']+)'/)
            const fieldName = matchResult?.[1]
            if (typeof fieldName === 'string') {
              toast.error('Field not found', {
                description: `Field '${fieldName}' does not exist in Dataverse. Please add it or remove it from the query.`,
              })
              throw new Error(`Field '${fieldName}' does not exist in Dataverse table`)
            }
          }
          
          throw new Error(`API error: ${response.status} ${response.statusText}. ${errorText}`)
        }

        const result = await response.json() as DataverseResponse<PsDeliveryroutes>
        
        if (result.value) {
          allRoutes.push(...result.value)
        }

        url = result['@odata.nextLink'] || undefined
      }

      setData(allRoutes)

      const vehicleIds = [...new Set(
        allRoutes
          .map(r => r.ps_vehicle_route)
          .filter((id): id is string => id !== null && id !== undefined)
      )]

      if (vehicleIds.length > 0) {
        try {
          const vehicleFilter = vehicleIds.map(id => `ps_vehicledatabaseid eq ${id}`).join(' or ')
          const vehicleData = await dataverseApi.queryTable<PsVehicledatabase>(
            token,
            psvehicledatabaseEntitySet,
            `$filter=${vehicleFilter}&$select=ps_vehicledatabaseid,ps_nickname,ps_plate,ps_make,ps_model`
          )

          const vehicleMap = new Map<string, string>()
          vehicleData.forEach(vehicle => {
            if (vehicle.ps_vehicledatabaseid) {
              const nickname = vehicle.ps_nickname
              const makeModel = vehicle.ps_make && vehicle.ps_model 
                ? `${vehicle.ps_make} ${vehicle.ps_model}` 
                : null
              const plate = vehicle.ps_plate
              const displayName = nickname || makeModel || plate || 'Unnamed Vehicle'
              vehicleMap.set(vehicle.ps_vehicledatabaseid, displayName)
            }
          })
          setVehicles(vehicleMap)
        } catch (err) {
          // Vehicle name lookup failed - will fall back to ps_vehiclename field
          if (err instanceof Error) {
            // Silently handle - vehicle names are optional for display
          }
        }
      }
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
    setError(null)
  }

  const handleDeleteConfirm = useCallback(async () => {
    if (!routeGroupToDelete || deleting) return
  
    const routeGroupToDeleteRef = routeGroupToDelete
    const routeIdsToDelete = new Set(
      routeGroupToDeleteRef.routes
        .map(r => r.ps_deliveryroutesid)
        .filter((id): id is string => id !== null && id !== undefined)
    )
  
    if (routeIdsToDelete.size === 0) {
      setError(new Error('No valid routes to delete'))
      return
    }
  
    // Immediately disable UI and clear previous errors
    setDeleting(true)
    setError(null)
  
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Failed to get access token')
  
      const routesToDelete = routeGroupToDeleteRef.routes.filter(r => r.ps_deliveryroutesid)
  
      // Parallel deletion with Promise.allSettled
      type DeleteResult = { success: boolean; routeId: string }
      const settledResults = await Promise.allSettled(
        routesToDelete.map(route =>
          dataverseApi
            .deleteRecord(token, psdeliveryroutesEntitySet, route.ps_deliveryroutesid!)
            .then(() => ({ success: true, routeId: route.ps_deliveryroutesid! }))
            .catch(() => ({ success: false, routeId: route.ps_deliveryroutesid! }))
        )
      )
      
      const deleteResults: DeleteResult[] = settledResults.map((r): DeleteResult => {
        if (r.status === 'fulfilled') {
          return r.value
        }
        return r.reason as DeleteResult
      })
  
      const failedCount = deleteResults.filter(r => !r.success).length
  
      if (failedCount > 0) {
        const errorMessage =
          failedCount === routesToDelete.length
            ? `Failed to delete all ${routesToDelete.length} route${routesToDelete.length !== 1 ? 's' : ''}`
            : `Failed to delete ${failedCount} of ${routesToDelete.length} route${routesToDelete.length !== 1 ? 's' : ''}`
        throw new Error(errorMessage)
      }
  
      const deletedCount = routeGroupToDeleteRef.stopCount
      const currentRouteGroupsLength = routeGroups.length
  
      // Remove deleted routes from state
      startTransition(() => {
        setData(prevData =>
          prevData.filter(route => !routeIdsToDelete.has(route.ps_deliveryroutesid!))
        )
      })
  
      toast.success('Route deleted successfully', {
        description: `Successfully deleted ${deletedCount} stop${deletedCount !== 1 ? 's' : ''}`,
        duration: 3000,
      })
  
      // Close dialog
      setDeleteDialogOpen(false)
      setRouteGroupToDelete(null)
      setError(null)
  
      // Adjust pagination if needed
      startTransition(() => {
        const newLength = currentRouteGroupsLength - 1
        if (currentPage > Math.ceil(newLength / ITEMS_PER_PAGE)) {
          setCurrentPage(prev => Math.max(1, prev - 1))
        }
      })
    } catch (err) {
      const deleteErr: Error = err instanceof Error ? err : new Error('Failed to delete delivery routes')
      setError(deleteErr)
      toast.error('Failed to delete route', {
        description: deleteErr.message,
        duration: 5000,
      })
    } finally {
      setDeleting(false)
    }
  }, [routeGroupToDelete, deleting, getAccessToken, currentPage, routeGroups.length])
  

  const handleDeleteCancel = useCallback(() => {
    if (!deleting) {
      setDeleteDialogOpen(false)
      setRouteGroupToDelete(null)
      setError(null)
    }
  }, [deleting])

  const getErrorMessage = (err: Error | null): string | null => {
    if (!err) return null
    if (err instanceof Error) return err.message
    return String(err)
  }

  if (selectedRouteGroup) {
    return (
      <RouteDetailsP2
        routeGroupId={selectedRouteGroup.id}
        routes={selectedRouteGroup.routes}
        onBack={() => setSelectedRouteGroup(null)}
        onNavigateToOrder={(orderId, stopId) => {
          toast.info('Navigate to order', {
            description: `Order ${orderId} - Stop ${stopId}`,
          })
        }}
      />
    )
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
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors"
                            >
                              <Trash2 className="size-4" />
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
          if (!open && !deleting) {
            handleDeleteCancel()
          }
        }}
      >
        <AlertDialogContent className="max-w-lg sm:max-w-xl">
          <div className="flex items-start gap-4">
              <div className="shrink-0">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                  <AlertTriangle className="size-6 text-destructive" />
                </div>
              </div>
            <div className="flex-1 space-y-4">
              <AlertDialogHeader className="space-y-2">
                <AlertDialogTitle className="text-xl font-semibold">
                  Delete Delivery Route
                </AlertDialogTitle>
                <AlertDialogDescription className="text-base leading-relaxed">
                  This action cannot be undone. This will permanently delete the route group and all associated stops.
                </AlertDialogDescription>
              </AlertDialogHeader>

              {routeGroupToDelete && (
                <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="flex items-start gap-2">
                      <Truck className="size-4 mt-0.5 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Vehicle</div>
                        <div className="text-sm font-medium truncate">
                          {routeGroupToDelete.vehicleName || 'Not specified'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <MapPin className="size-4 mt-0.5 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Stops</div>
                        <div className="text-sm font-medium">
                          <Badge variant="secondary" className="mt-0.5">
                            {routeGroupToDelete.stopCount} {routeGroupToDelete.stopCount === 1 ? 'stop' : 'stops'}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 sm:col-span-2">
                      <Calendar className="size-4 mt-0.5 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Created</div>
                        <div className="text-sm font-medium">{formatDate(routeGroupToDelete.createdon)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {deleting && (
                <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-4">
                  <Loader2 className="size-5 text-primary animate-spin shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">Deleting route...</div>
                    <div className="text-xs text-muted-foreground mt-1">Please wait</div>
                  </div>
                </div>
              )}

              {error && getErrorMessage(error) && (
                <div className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
                  <AlertTriangle className="size-5 text-destructive shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-destructive">Error</div>
                    <div className="text-sm text-destructive/90 mt-1">{getErrorMessage(error)}</div>
                  </div>
                </div>
              )}

              <AlertDialogFooter className="gap-2 sm:gap-0">
                <AlertDialogCancel 
                  disabled={deleting}
                  onClick={handleDeleteCancel}
                  className="sm:mr-2"
                >
                  <X className="size-4 mr-2" />
                  Cancel
                </AlertDialogCancel>
                <Button
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    if (!deleting) {
                      void handleDeleteConfirm()
                    }
                  }}
                  disabled={deleting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90 focus:ring-destructive disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  type="button"
                >
                  {deleting ? (
                    <>
                      <Loader2 className="size-4 mr-2 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="size-4 mr-2" />
                      Delete Route
                    </>
                  )}
                </Button>
              </AlertDialogFooter>
            </div>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

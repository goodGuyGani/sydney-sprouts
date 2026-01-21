import { useState, useEffect, useMemo, useCallback } from 'react'
import { MapContainer, Marker, Polyline, Popup } from 'react-leaflet'
import { Icon } from 'leaflet'
import { format } from 'date-fns'
import { useDataverseToken } from '@/hooks/useDataverseToken'
import { dataverseApi } from '@/lib/dataverseApi'
import {
  type PsDeliveryroutes,
  type Salesorder,
  type PsStaff,
  salesorderEntitySet,
  psstaffEntitySet,
} from '@/types/dataverse'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { MapTileLayer } from '@/components/MapStyleSelector'
import { MapBoundsFitter } from '@/components/MapBoundsFitter'
import { toast } from 'sonner'
import {
  Package,
  Truck,
  CheckCircle2,
  Users,
  Route as RouteIcon,
  Navigation,
  Calendar as CalendarIcon,
  Filter,
  MapPin,
  TrendingUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface DashboardKPIs {
  totalOrders: number
  trucksOnRoad: number
  completedDeliveries: number
  totalClients: number
  activeRoutes: number
  distanceTravelled: number
}

interface RouteGroup {
  routeGroupId: string
  routeName: string
  routes: PsDeliveryroutes[]
  color: string
}

const ROUTE_COLORS = [
  '#ef4444',
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#84cc16',
]

const KPI_CONFIG = [
  {
    key: 'totalOrders' as const,
    icon: Package,
    label: 'Total Orders',
    gradient: 'from-blue-500 to-cyan-500',
    bgGradient: 'from-blue-50 to-cyan-50',
    iconColor: 'text-blue-600',
  },
  {
    key: 'trucksOnRoad' as const,
    icon: Truck,
    label: 'Trucks on Road',
    gradient: 'from-orange-500 to-red-500',
    bgGradient: 'from-orange-50 to-red-50',
    iconColor: 'text-orange-600',
  },
  {
    key: 'completedDeliveries' as const,
    icon: CheckCircle2,
    label: 'Completed Deliveries',
    gradient: 'from-green-500 to-emerald-500',
    bgGradient: 'from-green-50 to-emerald-50',
    iconColor: 'text-green-600',
  },
  {
    key: 'totalClients' as const,
    icon: Users,
    label: 'Total Clients',
    gradient: 'from-purple-500 to-pink-500',
    bgGradient: 'from-purple-50 to-pink-50',
    iconColor: 'text-purple-600',
  },
  {
    key: 'activeRoutes' as const,
    icon: RouteIcon,
    label: 'Active Routes',
    gradient: 'from-indigo-500 to-blue-500',
    bgGradient: 'from-indigo-50 to-blue-50',
    iconColor: 'text-indigo-600',
  },
  {
    key: 'distanceTravelled' as const,
    icon: Navigation,
    label: 'Distance travelled',
    gradient: 'from-teal-500 to-cyan-500',
    bgGradient: 'from-teal-50 to-cyan-50',
    iconColor: 'text-teal-600',
    format: (value: number) => `${value}km`,
  },
]

export function DashboardOverview() {
  const { getAccessToken } = useDataverseToken()
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [activeTab, setActiveTab] = useState<'historical' | 'today'>('historical')
  const [routeTypeFilter, setRouteTypeFilter] = useState<'territory' | 'driver'>('territory')
  const [driverFilter, setDriverFilter] = useState<string>('all')
  const [routes, setRoutes] = useState<PsDeliveryroutes[]>([])
  const [orders, setOrders] = useState<Salesorder[]>([])
  const [drivers, setDrivers] = useState<PsStaff[]>([])
  const [loading, setLoading] = useState(false)

  const fetchRoutes = useCallback(async () => {
    if (!selectedDate) return

    setLoading(true)
    try {
      const token = await getAccessToken()
      if (!token) {
        throw new Error('Failed to get access token')
      }

      const dateStr = format(selectedDate, 'yyyy-MM-dd')
      const dateStart = `${dateStr}T00:00:00Z`
      const dateEnd = `${dateStr}T23:59:59Z`

      const selectFields = [
        'ps_deliveryroutesid',
        'ps_sequence',
        'ps_sitelat',
        'ps_sitelong',
        'ps_routegroupid',
        'ps_routename',
        'ps_route_date',
        'ps_driver',
        'ps_territorygroup',
        'ps_vehicle_route',
        'ps_vehiclename',
        'ps_estimateddistance',
        'ps_deliveryconfirmationstatus',
        'ps_account',
        'ps_address',
      ].join(',')

      let filter = `ps_route_date ge ${dateStart} and ps_route_date le ${dateEnd}`
      
      if (activeTab === 'today' && routeTypeFilter === 'driver' && driverFilter !== 'all') {
        filter += ` and _ps_driver_value eq ${driverFilter}`
      }

      const query = `$select=${selectFields}&$filter=${encodeURIComponent(filter)}&$orderby=ps_routegroupid,ps_sequence`
      
      let fetchedRoutes: PsDeliveryroutes[] = []
      let nextUrl: string | undefined = query
      
      while (nextUrl) {
        const response = await fetch(
          `https://pacerprojects.crm6.dynamics.com/api/data/v9.2/ps_deliveryrouteses?${nextUrl}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/json',
              'OData-MaxVersion': '4.0',
              'OData-Version': '4.0',
              'Prefer': 'odata.include-annotations="*"',
            },
          }
        )

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
                description: `Field '${fieldName}' does not exist in Dataverse.`,
              })
            }
          }
          
          throw new Error(`API error: ${response.status} ${response.statusText}. ${errorText}`)
        }

        const result = await response.json() as { value: PsDeliveryroutes[]; '@odata.nextLink'?: string }
        fetchedRoutes.push(...result.value)
        nextUrl = result['@odata.nextLink']?.split('?')[1]
      }
      setRoutes(fetchedRoutes)

      const routeIds = fetchedRoutes
        .map(r => r.ps_deliveryroutesid)
        .filter((id): id is string => id !== null && id !== undefined)

      if (routeIds.length > 0) {
        const filterOrders = routeIds.map(id => `_ps_deliveryroute_value eq ${id}`).join(' or ')
        let fetchedOrders: Salesorder[] = []
        let ordersNextUrl: string | undefined = `$filter=${filterOrders}&$select=salesorderid,ps_deliveryroute`
        
        while (ordersNextUrl) {
          const fullResponse = await fetch(
            `https://pacerprojects.crm6.dynamics.com/api/data/v9.2/${salesorderEntitySet}?${ordersNextUrl}`,
            {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json',
                'OData-MaxVersion': '4.0',
                'OData-Version': '4.0',
                'Prefer': 'odata.include-annotations="*"',
              },
            }
          )
          
          if (!fullResponse.ok) {
            break
          }
          
          const ordersResult = await fullResponse.json() as { value: Salesorder[]; '@odata.nextLink'?: string }
          fetchedOrders.push(...ordersResult.value)
          ordersNextUrl = ordersResult['@odata.nextLink']?.split('?')[1]
        }
        setOrders(fetchedOrders)
      } else {
        setOrders([])
      }

      const driverIds = [...new Set(fetchedRoutes.map(r => r.ps_driver).filter((id): id is string => id !== null && id !== undefined))]
      if (driverIds.length > 0) {
        const filterDrivers = driverIds.map(id => `ps_staffid eq ${id}`).join(' or ')
        const fetchedDrivers = await dataverseApi.queryTable<PsStaff>(
          token,
          psstaffEntitySet,
          `$filter=${filterDrivers}&$select=ps_staffid,ps_name,ps_firstname,ps_lastname`
        )
        setDrivers(fetchedDrivers)
      } else {
        setDrivers([])
      }
    } catch (error) {
      toast.error('Failed to load dashboard data', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setLoading(false)
    }
  }, [selectedDate, activeTab, routeTypeFilter, driverFilter, getAccessToken])

  useEffect(() => {
    void fetchRoutes()
  }, [fetchRoutes])

  const routeGroups = useMemo((): RouteGroup[] => {
    const groups = new Map<string, RouteGroup>()
    
    routes.forEach((route, index) => {
      const groupId = route.ps_routegroupid || route.ps_routename || `route_${index}`
      if (!groups.has(groupId)) {
        groups.set(groupId, {
          routeGroupId: groupId,
          routeName: route.ps_routename || `Route ${groups.size + 1}`,
          routes: [],
          color: ROUTE_COLORS[groups.size % ROUTE_COLORS.length],
        })
      }
      groups.get(groupId)!.routes.push(route)
    })

    return Array.from(groups.values())
  }, [routes])

  const kpis = useMemo((): DashboardKPIs => {
    const uniqueVehicles = new Set(
      routes.map(r => r.ps_vehicle_route || r.ps_vehiclename).filter(Boolean)
    )
    
    const completedDeliveries = routes.filter(
      r => r.ps_deliveryconfirmationstatus === 2
    ).length

    const uniqueClients = new Set(
      routes.map(r => r.ps_account).filter((id): id is string => id !== null && id !== undefined)
    )

    const uniqueRouteGroups = new Set(
      routes.map(r => r.ps_routegroupid || r.ps_routename).filter(Boolean)
    )

    const totalDistance = routes.reduce((sum, r) => sum + (r.ps_estimateddistance || 0), 0)

    return {
      totalOrders: orders.length,
      trucksOnRoad: uniqueVehicles.size,
      completedDeliveries,
      totalClients: uniqueClients.size,
      activeRoutes: uniqueRouteGroups.size,
      distanceTravelled: Math.round(totalDistance),
    }
  }, [routes, orders])

  const filteredRouteGroups = useMemo(() => {
    if (activeTab === 'today' && routeTypeFilter === 'driver' && driverFilter !== 'all') {
      return routeGroups.filter(group =>
        group.routes.some(r => r.ps_driver === driverFilter)
      )
    }
    return routeGroups
  }, [routeGroups, activeTab, routeTypeFilter, driverFilter])

  const allRoutePoints = useMemo(() => {
    return filteredRouteGroups.flatMap(group =>
      group.routes
        .map(r => ({
          lat: r.ps_sitelat,
          lng: r.ps_sitelong,
        }))
        .filter((p): p is { lat: number; lng: number } => p.lat !== null && p.lat !== undefined && p.lng !== null && p.lng !== undefined)
    )
  }, [filteredRouteGroups])

  const driverOptions = useMemo(() => {
    return drivers.map(d => ({
      id: d.ps_staffid || '',
      name: `${d.ps_firstname || ''} ${d.ps_lastname || ''}`.trim() || d.ps_name || 'Unknown',
    }))
  }, [drivers])

  const isToday = useMemo(() => {
    const today = new Date()
    return format(selectedDate, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')
  }, [selectedDate])

  return (
    <div className="flex flex-col h-full gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-gray-900 to-gray-700 dark:from-gray-100 dark:to-gray-300 bg-clip-text text-transparent">
            Dashboard Overview
          </h1>
          <p className="text-muted-foreground mt-1.5">
            Monitor and analyze your delivery operations
          </p>
        </div>
        <div className="flex items-center gap-3 px-4 py-2.5 bg-muted/50 rounded-lg border">
          <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Route shown</span>
            <span className="text-sm font-semibold">{format(selectedDate, 'do MMMM yyyy')}</span>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'historical' | 'today')} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2 h-11">
          <TabsTrigger 
            value="historical" 
            className="flex items-center gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-red-500 data-[state=active]:to-red-600 data-[state=active]:text-white transition-all"
          >
            <CalendarIcon className="h-4 w-4" />
            Historical routes
          </TabsTrigger>
          <TabsTrigger 
            value="today" 
            className="flex items-center gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-red-500 data-[state=active]:to-red-600 data-[state=active]:text-white transition-all"
          >
            <TrendingUp className="h-4 w-4" />
            Todays Routes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="historical" className="mt-6 space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[280px] justify-start text-left font-normal border-2 shadow-sm hover:shadow-md transition-shadow",
                    !selectedDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? format(selectedDate, "PPP") : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => {
                    if (date) {
                      setSelectedDate(date)
                    }
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {KPI_CONFIG.map((config) => {
                  const value = kpis[config.key]
                  const displayValue = config.format ? config.format(value) : value
                  return (
                    <KPICard
                      key={config.key}
                      icon={config.icon}
                      label={config.label}
                      value={displayValue}
                      gradient={config.gradient}
                      bgGradient={config.bgGradient}
                      iconColor={config.iconColor}
                    />
                  )
                })}
              </div>

              <Card className="border-2 shadow-lg overflow-hidden">
                <CardHeader className="border-b bg-gradient-to-r from-gray-50 to-gray-100/50 dark:from-gray-900 dark:to-gray-800">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500">
                        <MapPin className="h-4 w-4 text-white" />
                      </div>
                      <CardTitle className="text-lg">Route Map</CardTitle>
                    </div>
                    {filteredRouteGroups.length > 0 && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                        <span>{filteredRouteGroups.length} active route{filteredRouteGroups.length !== 1 ? 's' : ''}</span>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-0 h-[600px]">
                  {loading ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3">
                      <Spinner className="h-8 w-8" />
                      <p className="text-sm text-muted-foreground">Loading route data...</p>
                    </div>
                  ) : allRoutePoints.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-6">
                      <div className="p-4 rounded-full bg-muted">
                        <MapPin className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-semibold">No routes found</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          No delivery routes available for the selected date.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <MapContainer
                      center={allRoutePoints.length > 0 ? [allRoutePoints[0].lat, allRoutePoints[0].lng] : [14.5995, 120.9842]}
                      zoom={12}
                      className="h-full w-full"
                    >
                      <MapTileLayer style="osm" />
                      {filteredRouteGroups.map((group) => {
                        const points = group.routes
                          .map(r => ({
                            lat: r.ps_sitelat,
                            lng: r.ps_sitelong,
                          }))
                          .filter((p): p is { lat: number; lng: number } => p.lat !== null && p.lat !== undefined && p.lng !== null && p.lng !== undefined)
                          .sort((a, b) => {
                            const seqA = group.routes.find(r => r.ps_sitelat === a.lat && r.ps_sitelong === a.lng)?.ps_sequence || 0
                            const seqB = group.routes.find(r => r.ps_sitelat === b.lat && r.ps_sitelong === b.lng)?.ps_sequence || 0
                            return seqA - seqB
                          })

                        return (
                          <div key={group.routeGroupId}>
                            {points.length > 1 && (
                              <Polyline
                                positions={points.map(p => [p.lat, p.lng])}
                                color={group.color}
                                weight={4}
                                opacity={0.8}
                              />
                            )}
                            {points.map((point, idx) => (
                              <Marker
                                key={`${group.routeGroupId}-${idx}`}
                                position={[point.lat, point.lng]}
                                icon={new Icon({
                                  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
                                  iconSize: [25, 41],
                                  iconAnchor: [12, 41],
                                })}
                              >
                                <Popup>
                                  <div className="text-sm">
                                    <div className="font-semibold">{group.routeName}</div>
                                    <div className="text-muted-foreground">Stop {idx + 1} of {points.length}</div>
                                  </div>
                                </Popup>
                              </Marker>
                            ))}
                          </div>
                        )
                      })}
                      {allRoutePoints.length > 0 && (
                        <MapBoundsFitter positions={allRoutePoints.map(p => [p.lat, p.lng])} />
                      )}
                    </MapContainer>
                  )}
                </CardContent>
              </Card>
          </div>
        </TabsContent>

        <TabsContent value="today" className="mt-6 space-y-6">
          {isToday && (
            <Card className="border-2 shadow-lg">
              <CardHeader className="border-b">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-red-500 to-red-600">
                    <Filter className="h-4 w-4 text-white" />
                  </div>
                  <CardTitle className="text-lg">Filters</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="flex flex-wrap gap-4 items-center">
                  <div className="flex items-center gap-3">
                    <Button
                      variant="default"
                      className="bg-red-600 hover:bg-red-700 text-white border-red-600 shadow-md pointer-events-none"
                    >
                      Route type
                    </Button>
                    <Select value={routeTypeFilter} onValueChange={(v) => setRouteTypeFilter(v as 'territory' | 'driver')}>
                      <SelectTrigger className="w-[180px] border-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="territory">Territory</SelectItem>
                        <SelectItem value="driver">Driver</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {routeTypeFilter === 'driver' && (
                    <div className="flex items-center gap-2">
                      <Select value={driverFilter} onValueChange={setDriverFilter}>
                        <SelectTrigger className="w-[180px] border-2">
                          <SelectValue placeholder="All Drivers" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Drivers</SelectItem>
                          {driverOptions.map((driver) => (
                            <SelectItem key={driver.id} value={driver.id}>
                              {driver.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {KPI_CONFIG.map((config) => {
              const value = kpis[config.key]
              const displayValue = config.format ? config.format(value) : value
              return (
                <KPICard
                  key={config.key}
                  icon={config.icon}
                  label={config.label}
                  value={displayValue}
                  gradient={config.gradient}
                  bgGradient={config.bgGradient}
                  iconColor={config.iconColor}
                />
              )
            })}
          </div>

          <Card className="border-2 shadow-lg overflow-hidden">
            <CardHeader className="border-b bg-gradient-to-r from-gray-50 to-gray-100/50 dark:from-gray-900 dark:to-gray-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500">
                    <MapPin className="h-4 w-4 text-white" />
                  </div>
                  <CardTitle className="text-lg">Route Map</CardTitle>
                </div>
                {filteredRouteGroups.length > 0 && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                    <span>{filteredRouteGroups.length} active route{filteredRouteGroups.length !== 1 ? 's' : ''}</span>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0 h-[600px]">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                  <Spinner className="h-8 w-8" />
                  <p className="text-sm text-muted-foreground">Loading route data...</p>
                </div>
              ) : allRoutePoints.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-6">
                  <div className="p-4 rounded-full bg-muted">
                    <MapPin className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-semibold">No routes found</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      No delivery routes available for today.
                    </p>
                  </div>
                </div>
              ) : (
                <MapContainer
                  center={allRoutePoints.length > 0 ? [allRoutePoints[0].lat, allRoutePoints[0].lng] : [14.5995, 120.9842]}
                  zoom={12}
                  className="h-full w-full"
                >
                  <MapTileLayer style="osm" />
                  {filteredRouteGroups.map((group) => {
                    const points = group.routes
                      .map(r => ({
                        lat: r.ps_sitelat,
                        lng: r.ps_sitelong,
                      }))
                      .filter((p): p is { lat: number; lng: number } => p.lat !== null && p.lat !== undefined && p.lng !== null && p.lng !== undefined)
                      .sort((a, b) => {
                        const seqA = group.routes.find(r => r.ps_sitelat === a.lat && r.ps_sitelong === a.lng)?.ps_sequence || 0
                        const seqB = group.routes.find(r => r.ps_sitelat === b.lat && r.ps_sitelong === b.lng)?.ps_sequence || 0
                        return seqA - seqB
                      })

                    return (
                      <div key={group.routeGroupId}>
                        {points.length > 1 && (
                          <Polyline
                            positions={points.map(p => [p.lat, p.lng])}
                            color={group.color}
                            weight={4}
                            opacity={0.8}
                          />
                        )}
                        {points.map((point, idx) => (
                          <Marker
                            key={`${group.routeGroupId}-${idx}`}
                            position={[point.lat, point.lng]}
                            icon={new Icon({
                              iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
                              iconSize: [25, 41],
                              iconAnchor: [12, 41],
                            })}
                          >
                            <Popup>
                              <div className="text-sm">
                                <div className="font-semibold">{group.routeName}</div>
                                <div className="text-muted-foreground">Stop {idx + 1} of {points.length}</div>
                              </div>
                            </Popup>
                          </Marker>
                        ))}
                      </div>
                    )
                  })}
                  {allRoutePoints.length > 0 && (
                    <MapBoundsFitter positions={allRoutePoints.map(p => [p.lat, p.lng])} />
                  )}
                </MapContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

interface KPICardProps {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | number
  gradient: string
  bgGradient: string
  iconColor: string
}

function KPICard({ icon: Icon, label, value, gradient, bgGradient, iconColor }: KPICardProps) {
  return (
    <Card className="border-2 shadow-md hover:shadow-lg transition-all duration-300 hover:scale-[1.02] group overflow-hidden relative">
      <div className={cn('absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-5 transition-opacity', gradient)} />
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-muted-foreground mb-2">{label}</p>
            <p className={cn('text-3xl font-bold tracking-tight bg-gradient-to-r bg-clip-text text-transparent', gradient)}>
              {value}
            </p>
          </div>
          <div className={cn('p-4 rounded-xl bg-gradient-to-br shadow-lg group-hover:scale-110 transition-transform duration-300', bgGradient)}>
            <Icon className={cn('h-6 w-6', iconColor)} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

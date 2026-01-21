import { useState, useEffect, useMemo, useCallback } from 'react'
import { useDataverseToken } from '@/hooks/useDataverseToken'
import { dataverseApi } from '@/lib/dataverseApi'
import { format, subDays, isToday, parseISO, differenceInDays } from 'date-fns'
import {
  type PsDeliveryroutes,
  type Salesorder,
  type PsStaff,
  type PsVehicledatabase,
  psdeliveryroutesEntitySet,
  salesorderEntitySet,
  psstaffEntitySet,
  psvehicledatabaseEntitySet,
} from '@/types/dataverse'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { LineChart, Line, PieChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Legend } from 'recharts'
import { toast } from 'sonner'
import { 
  Truck, 
  Route, 
  Package, 
  CheckCircle2, 
  TrendingUp, 
  TrendingDown,
  AlertCircle,
  CheckCircle,
  Info,
  XCircle,
  Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useNavigate } from 'react-router-dom'

interface DashboardKPIs {
  activeRoutes: number
  trucksOnRoad: number
  totalOrdersToday: number
  completedDeliveries: number
  activeRoutesDelta: number
  trucksOnRoadDelta: number
  totalOrdersDelta: number
  completionRate: number
}

interface RouteWithMetadata extends PsDeliveryroutes {
  driverName?: string
  vehicleName?: string
  totalStops?: number
  completedStops?: number
  progress?: number
  status?: 'On Track' | 'Delayed' | 'Behind Schedule'
}

interface Notification {
  id: string
  type: 'warning' | 'success' | 'info' | 'error'
  title: string
  description: string
  timestamp: Date
  routeId?: string
}

const CORAL_RED = '#FF6B5C'
const TEAL = '#4EC6D0'
const DARK_RED = '#E63946'

const CHART_COLORS = [CORAL_RED, DARK_RED, TEAL, '#8B7355', '#6C757D']

export function OperationsDashboard() {
  const { getAccessToken } = useDataverseToken()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [routes, setRoutes] = useState<PsDeliveryroutes[]>([])
  const [todayRoutes, setTodayRoutes] = useState<PsDeliveryroutes[]>([])
  const [yesterdayRoutes, setYesterdayRoutes] = useState<PsDeliveryroutes[]>([])
  const [orders, setOrders] = useState<Salesorder[]>([])
  const [yesterdayOrders, setYesterdayOrders] = useState<Salesorder[]>([])
  const [drivers, setDrivers] = useState<Map<string, string>>(new Map())
  const [vehicles, setVehicles] = useState<Map<string, string>>(new Map())
  const [vehiclesOnRoad, setVehiclesOnRoad] = useState<Set<string>>(new Set())

  const fetchDashboardData = useCallback(async () => {
    setLoading(true)
    try {
      const token = await getAccessToken()
      if (!token) {
        throw new Error('Failed to get access token')
      }

      const today = new Date()
      const yesterday = subDays(today, 1)
      const sevenDaysAgo = subDays(today, 7)

      const todayStr = format(today, 'yyyy-MM-dd')
      const yesterdayStr = format(yesterday, 'yyyy-MM-dd')
      const sevenDaysAgoStr = format(sevenDaysAgo, 'yyyy-MM-dd')

      const todayStart = `${todayStr}T00:00:00Z`
      const todayEnd = `${todayStr}T23:59:59Z`
      const yesterdayStart = `${yesterdayStr}T00:00:00Z`
      const yesterdayEnd = `${yesterdayStr}T23:59:59Z`
      const sevenDaysStart = `${sevenDaysAgoStr}T00:00:00Z`

      const routeSelectFields = [
        'ps_deliveryroutesid',
        'ps_routename',
        'ps_route_date',
        'ps_driver',
        'ps_vehicle_route',
        'ps_vehiclename',
        'ps_driver_name',
        'ps_sequence',
        'ps_deliveryconfirmationstatus',
        'ps_actualdeliverytime',
        'ps_plannedstarttime',
        'ps_plannedendtime',
        'ps_actualstarttime',
        'ps_actualendtime',
        'ps_orderpriority',
        'statecode',
        'statuscode',
        'createdon',
      ].join(',')

      const todayFilter = `ps_route_date ge ${todayStart} and ps_route_date le ${todayEnd} and statecode ne 2`
      const yesterdayFilter = `ps_route_date ge ${yesterdayStart} and ps_route_date le ${yesterdayEnd}`
      const weekFilter = `ps_route_date ge ${sevenDaysStart} and statecode ne 2`

      const yesterdayOrdersFilter = `createdon ge ${yesterdayStart} and createdon le ${yesterdayEnd}`

      const [todayData, yesterdayData, weekData, ordersData, yesterdayOrdersData] = await Promise.all([
        dataverseApi.queryTable<PsDeliveryroutes>(
          token,
          psdeliveryroutesEntitySet,
          `$select=${routeSelectFields}&$filter=${encodeURIComponent(todayFilter)}&$orderby=ps_route_date desc,ps_sequence`
        ),
        dataverseApi.queryTable<PsDeliveryroutes>(
          token,
          psdeliveryroutesEntitySet,
          `$select=${routeSelectFields}&$filter=${encodeURIComponent(yesterdayFilter)}&$orderby=ps_route_date desc,ps_sequence`
        ),
        dataverseApi.queryTable<PsDeliveryroutes>(
          token,
          psdeliveryroutesEntitySet,
          `$select=${routeSelectFields}&$filter=${encodeURIComponent(weekFilter)}&$orderby=ps_route_date desc,ps_sequence`
        ),
        dataverseApi.queryTable<Salesorder>(
          token,
          salesorderEntitySet,
          `$select=salesorderid,createdon,statecode&$filter=createdon ge ${todayStart} and createdon le ${todayEnd}`
        ),
        dataverseApi.queryTable<Salesorder>(
          token,
          salesorderEntitySet,
          `$select=salesorderid,createdon,statecode&$filter=${yesterdayOrdersFilter}`
        ),
      ])

      setTodayRoutes(todayData)
      setYesterdayRoutes(yesterdayData)
      setRoutes(weekData)

      const uniqueDriverIds = new Set<string>()
      const uniqueVehicleIds = new Set<string>()
      
      weekData.forEach(route => {
        if (route.ps_driver) uniqueDriverIds.add(route.ps_driver)
        if (route.ps_vehicle_route) uniqueVehicleIds.add(route.ps_vehicle_route)
      })

      const driverIds = Array.from(uniqueDriverIds)
      const vehicleIds = Array.from(uniqueVehicleIds)

      if (driverIds.length > 0) {
        const driverFilter = driverIds.map(id => `ps_staffid eq ${id}`).join(' or ')
        const driversData = await dataverseApi.queryTable<PsStaff>(
          token,
          psstaffEntitySet,
          `$filter=${driverFilter}&$select=ps_staffid,ps_name,ps_firstname,ps_lastname`
        )
        const driverMap = new Map<string, string>()
        driversData.forEach(driver => {
          const name = driver.ps_name || `${driver.ps_firstname || ''} ${driver.ps_lastname || ''}`.trim() || 'Unknown'
          if (driver.ps_staffid) driverMap.set(driver.ps_staffid, name)
        })
        setDrivers(driverMap)
      }

      if (vehicleIds.length > 0) {
        const vehicleFilter = vehicleIds.map(id => `ps_vehicledatabaseid eq ${id}`).join(' or ')
        const vehiclesData = await dataverseApi.queryTable<PsVehicledatabase>(
          token,
          psvehicledatabaseEntitySet,
          `$filter=${vehicleFilter}&$select=ps_vehicledatabaseid,ps_nickname,ps_plate`
        )
        const vehicleMap = new Map<string, string>()
        vehiclesData.forEach(vehicle => {
          const name = vehicle.ps_nickname || vehicle.ps_plate || 'Unknown Vehicle'
          if (vehicle.ps_vehicledatabaseid) vehicleMap.set(vehicle.ps_vehicledatabaseid, name)
        })
        setVehicles(vehicleMap)
      }

      setOrders(ordersData)
      setYesterdayOrders(yesterdayOrdersData)

      const activeVehicleSet = new Set<string>()
      todayData.forEach(route => {
        if (route.ps_vehicle_route) activeVehicleSet.add(route.ps_vehicle_route)
      })
      setVehiclesOnRoad(activeVehicleSet)

    } catch (error) {
      toast.error('Failed to load dashboard data', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setLoading(false)
    }
  }, [getAccessToken])

  useEffect(() => {
    void fetchDashboardData()
    
    const interval = setInterval(() => {
      void fetchDashboardData()
    }, 30000)

    return () => clearInterval(interval)
  }, [fetchDashboardData])

  const kpis = useMemo((): DashboardKPIs => {
    const uniqueRouteGroups = new Set(
      todayRoutes.map(r => r.ps_routegroupid || r.ps_routename).filter(Boolean)
    )
    
    const yesterdayUniqueRouteGroups = new Set(
      yesterdayRoutes.map(r => r.ps_routegroupid || r.ps_routename).filter(Boolean)
    )

    const completedDeliveries = todayRoutes.filter(
      r => r.ps_deliveryconfirmationstatus === 2
    ).length

    const activeRoutes = uniqueRouteGroups.size
    const yesterdayActiveRoutes = yesterdayUniqueRouteGroups.size
    const activeRoutesDelta = yesterdayActiveRoutes > 0 
      ? ((activeRoutes - yesterdayActiveRoutes) / yesterdayActiveRoutes) * 100 
      : 0

    const trucksOnRoad = vehiclesOnRoad.size
    const yesterdayTrucks = new Set(
      yesterdayRoutes.map(r => r.ps_vehicle_route).filter(Boolean) as string[]
    ).size
    const trucksOnRoadDelta = trucksOnRoad - yesterdayTrucks

    const totalOrdersToday = orders.length
    const yesterdayOrdersCount = yesterdayOrders.length
    const totalOrdersDelta = yesterdayOrdersCount > 0
      ? ((totalOrdersToday - yesterdayOrdersCount) / yesterdayOrdersCount) * 100
      : totalOrdersToday > 0 ? 100 : 0

    const completionRate = todayRoutes.length > 0 
      ? (completedDeliveries / todayRoutes.length) * 100 
      : 0

    return {
      activeRoutes,
      trucksOnRoad,
      totalOrdersToday,
      completedDeliveries,
      activeRoutesDelta,
      trucksOnRoadDelta,
      totalOrdersDelta,
      completionRate,
    }
  }, [todayRoutes, yesterdayRoutes, orders, yesterdayOrders, vehiclesOnRoad])

  const deliveryPerformanceData = useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = subDays(new Date(), 6 - i)
      const dateStr = format(date, 'yyyy-MM-dd')
      const dateStart = `${dateStr}T00:00:00Z`
      const dateEnd = `${dateStr}T23:59:59Z`
      
      const dayRoutes = routes.filter(r => {
        if (!r.ps_route_date) return false
        const routeDate = parseISO(r.ps_route_date)
        return routeDate >= parseISO(dateStart) && routeDate <= parseISO(dateEnd)
      })
      
      const completed = dayRoutes.filter(r => r.ps_deliveryconfirmationstatus === 2).length
      const total = dayRoutes.length
      const completionRate = total > 0 ? (completed / total) * 100 : 0
      const delayedRate = total > 0 ? (dayRoutes.filter(r => {
        if (!r.ps_plannedendtime || !r.ps_actualendtime) return false
        return parseISO(r.ps_actualendtime) > parseISO(r.ps_plannedendtime)
      }).length / total) * 100 : 0
      
      return {
        date: format(date, 'MMM d'),
        completed: Math.round(completionRate),
        delayed: Math.round(delayedRate),
      }
    })
    
    return last7Days
  }, [routes])

  const orderDistributionData = useMemo(() => {
    const routeGroups = new Map<string, number>()
    
    todayRoutes.forEach(route => {
      const groupId = route.ps_routegroupid || route.ps_routename || 'Other'
      routeGroups.set(groupId, (routeGroups.get(groupId) || 0) + 1)
    })

    const distribution = Array.from(routeGroups.entries())
      .map(([name, count]) => ({ name, value: count }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)

    return distribution
  }, [todayRoutes])

  const activeRoutesTableData = useMemo((): RouteWithMetadata[] => {
    const routeGroups = new Map<string, RouteWithMetadata>()
    
    todayRoutes.forEach(route => {
      const groupId = route.ps_routegroupid || route.ps_routename || route.ps_deliveryroutesid || ''
      if (!routeGroups.has(groupId)) {
        const driverName = route.ps_driver 
          ? drivers.get(route.ps_driver) || route.ps_driver_name || 'Unknown Driver'
          : 'Unassigned'
        
        const vehicleName = route.ps_vehicle_route
          ? vehicles.get(route.ps_vehicle_route) || route.ps_vehiclename || 'Unknown Vehicle'
          : 'Unassigned'
        
        const routesInGroup = todayRoutes.filter(r => 
          (r.ps_routegroupid || r.ps_routename || r.ps_deliveryroutesid) === groupId
        )
        const totalStops = routesInGroup.length
        const completedStops = routesInGroup.filter(r => r.ps_deliveryconfirmationstatus === 2).length
        const progress = totalStops > 0 ? (completedStops / totalStops) * 100 : 0
        
        let status: 'On Track' | 'Delayed' | 'Behind Schedule' = 'On Track'
        if (progress < 50 && route.ps_actualstarttime) {
          const now = new Date()
          const plannedEnd = route.ps_plannedendtime ? parseISO(route.ps_plannedendtime) : null
          if (plannedEnd && now > plannedEnd) {
            status = 'Behind Schedule'
          } else if (progress < 30) {
            status = 'Delayed'
          }
        }
        
        routeGroups.set(groupId, {
          ...route,
          driverName,
          vehicleName,
          totalStops,
          completedStops,
          progress,
          status,
        })
      }
    })
    
    return Array.from(routeGroups.values())
      .sort((a, b) => {
        if (a.status === 'Behind Schedule' && b.status !== 'Behind Schedule') return -1
        if (b.status === 'Behind Schedule' && a.status !== 'Behind Schedule') return 1
        return (b.progress || 0) - (a.progress || 0)
      })
      .slice(0, 10)
  }, [todayRoutes, drivers, vehicles])

  const notifications = useMemo((): Notification[] => {
    const notifs: Notification[] = []
    
    activeRoutesTableData.forEach(route => {
      if (route.status === 'Behind Schedule') {
        notifs.push({
          id: route.ps_deliveryroutesid || '',
          type: 'error',
          title: `Truck ${route.vehicleName} is behind schedule`,
          description: `Route ${route.ps_routename || 'N/A'} needs attention`,
          timestamp: new Date(),
          routeId: route.ps_deliveryroutesid || undefined,
        })
      } else if (route.status === 'Delayed') {
        notifs.push({
          id: `delay-${route.ps_deliveryroutesid || ''}`,
          type: 'warning',
          title: `Route ${route.ps_routename || 'N/A'} is delayed`,
          description: `Driver ${route.driverName} is running late`,
          timestamp: new Date(),
          routeId: route.ps_deliveryroutesid || undefined,
        })
      }
    })

    const completedRoutes = todayRoutes.filter(r => r.ps_deliveryconfirmationstatus === 2)
    if (completedRoutes.length > 0) {
      const recentCompleted = completedRoutes
        .filter(r => {
          if (!r.ps_actualdeliverytime) return false
          const deliveryTime = parseISO(r.ps_actualdeliverytime)
          const now = new Date()
          return differenceInDays(now, deliveryTime) === 0
        })
        .slice(0, 3)
      
      recentCompleted.forEach(route => {
        notifs.push({
          id: `completed-${route.ps_deliveryroutesid || ''}`,
          type: 'success',
          title: `Route ${route.ps_routename || 'N/A'} completed successfully`,
          description: `Delivery completed at ${route.ps_actualdeliverytime ? format(parseISO(route.ps_actualdeliverytime), 'HH:mm') : 'N/A'}`,
          timestamp: route.ps_actualdeliverytime ? parseISO(route.ps_actualdeliverytime) : new Date(),
          routeId: route.ps_deliveryroutesid || undefined,
        })
      })
    }

    const newAssignments = todayRoutes
      .filter(r => {
        if (!r.createdon) return false
        const created = parseISO(r.createdon)
        return isToday(created)
      })
      .slice(0, 2)
    
    newAssignments.forEach(route => {
      notifs.push({
        id: `assign-${route.ps_deliveryroutesid || ''}`,
        type: 'info',
        title: `New driver assigned to route ${route.ps_routename || 'N/A'}`,
        description: `Driver ${route.ps_driver ? drivers.get(route.ps_driver) || 'Unknown' : 'Unassigned'} assigned`,
        timestamp: route.createdon ? parseISO(route.createdon) : new Date(),
        routeId: route.ps_deliveryroutesid || undefined,
      })
    })

    return notifs
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 6)
  }, [activeRoutesTableData, todayRoutes, drivers])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'On Track':
        return 'text-green-600 bg-green-50 border-green-200'
      case 'Delayed':
        return 'text-orange-600 bg-orange-50 border-orange-200'
      case 'Behind Schedule':
        return 'text-red-600 bg-red-50 border-red-200'
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200'
    }
  }

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'warning':
        return <AlertCircle className="h-4 w-4 text-yellow-600" />
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'info':
        return <Info className="h-4 w-4 text-blue-600" />
      case 'error':
        return <XCircle className="h-4 w-4 text-red-600" />
      default:
        return <Info className="h-4 w-4 text-gray-600" />
    }
  }

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'warning':
        return 'border-l-yellow-500'
      case 'success':
        return 'border-l-green-500'
      case 'info':
        return 'border-l-blue-500'
      case 'error':
        return 'border-l-red-500'
      default:
        return 'border-l-gray-500'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[600px]">
        <div className="flex flex-col items-center gap-4">
          <Spinner className="h-8 w-8" />
          <p className="text-sm text-muted-foreground">Loading dashboard data...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard Overview</h1>
        <div className="flex items-center gap-3">
          <Button
            onClick={() => navigate('/admin?tab=view')}
            className="bg-[#FF6B5C] hover:bg-[#E63946] text-white rounded-xl px-6 transition-colors"
          >
            View All Routes
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              navigate('/admin?tab=view')
            }}
            className="border-[#FF6B5C] text-[#FF6B5C] hover:bg-[#FF6B5C] hover:text-white rounded-xl px-6 transition-colors"
          >
            Completed Orders
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Active Routes"
          value={kpis.activeRoutes}
          delta={kpis.activeRoutesDelta}
          deltaType={kpis.activeRoutesDelta < 0 ? 'negative' : 'positive'}
          icon={Route}
        />
        <KPICard
          title="Trucks on Road"
          value={kpis.trucksOnRoad}
          delta={kpis.trucksOnRoadDelta}
          deltaType="neutral"
          icon={Truck}
        />
        <KPICard
          title="Total Orders Today"
          value={kpis.totalOrdersToday}
          delta={kpis.totalOrdersDelta}
          deltaType={kpis.totalOrdersDelta > 0 ? 'positive' : 'neutral'}
          icon={Package}
        />
        <KPICard
          title="Completed Deliveries"
          value={kpis.completedDeliveries}
          subtext={`${kpis.completionRate.toFixed(1)}% completion rate`}
          icon={CheckCircle2}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-white shadow-md border-0 rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle className="text-lg font-semibold">Delivery Performance</CardTitle>
            <span className="text-sm text-muted-foreground">Last 7 days</span>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                completed: { label: 'Completed', color: TEAL },
                delayed: { label: 'Delayed', color: CORAL_RED },
              }}
              className="h-[300px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={deliveryPerformanceData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis 
                    dataKey="date" 
                    stroke="#888"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    stroke="#888"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    domain={[0, 100]}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="completed" 
                    stroke={TEAL}
                    strokeWidth={2}
                    dot={{ r: 4, fill: TEAL }}
                    name="Completion Rate %"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="delayed" 
                    stroke={CORAL_RED}
                    strokeWidth={2}
                    dot={{ r: 4, fill: CORAL_RED }}
                    name="Delayed Rate %"
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="bg-white shadow-md border-0 rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle className="text-lg font-semibold">Order Distribution</CardTitle>
            <span className="text-sm text-muted-foreground">Today</span>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={orderDistributionData.reduce((acc, item, idx) => {
                acc[item.name] = { label: item.name, color: CHART_COLORS[idx % CHART_COLORS.length] }
                return acc
              }, {} as Record<string, { label: string; color: string }>)}
              className="h-[300px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={orderDistributionData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {orderDistributionData.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </PieChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-white shadow-md border-0 rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle className="text-lg font-semibold">Active Routes</CardTitle>
            <Button
              variant="link"
              onClick={() => navigate('/admin?tab=view')}
              className="text-[#FF6B5C] hover:text-[#E63946] p-0 h-auto font-medium"
            >
              View All
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-b">
                  <TableHead className="font-semibold">Route ID</TableHead>
                  <TableHead className="font-semibold">Driver</TableHead>
                  <TableHead className="font-semibold">Vehicle</TableHead>
                  <TableHead className="font-semibold">Stops</TableHead>
                  <TableHead className="font-semibold">Progress</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeRoutesTableData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No active routes for today
                    </TableCell>
                  </TableRow>
                ) : (
                  activeRoutesTableData.map((route) => (
                    <TableRow key={route.ps_deliveryroutesid} className="border-b hover:bg-gray-50">
                      <TableCell className="font-medium">
                        {route.ps_routename || (route.ps_deliveryroutesid 
                          ? `RT-${route.ps_deliveryroutesid.slice(-8).replace(/-/g, '').toUpperCase().slice(0, 8)}` 
                          : 'N/A')}
                      </TableCell>
                      <TableCell>{route.driverName || 'Unassigned'}</TableCell>
                      <TableCell>{route.vehicleName || 'Unassigned'}</TableCell>
                      <TableCell>
                        {route.completedStops || 0}/{route.totalStops || 0}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 w-24">
                          <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-[#FF6B5C] transition-all"
                              style={{ width: `${route.progress || 0}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-8">
                            {Math.round(route.progress || 0)}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant="outline" 
                          className={cn('text-xs font-medium border', getStatusColor(route.status || 'On Track'))}
                        >
                          {route.status || 'On Track'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="bg-white shadow-md border-0 rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle className="text-lg font-semibold">Recent Notifications</CardTitle>
            <Button
              variant="link"
              className="text-[#FF6B5C] hover:text-[#E63946] p-0 h-auto font-medium"
            >
              View All
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {notifications.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No notifications
                </div>
              ) : (
                notifications.map((notif) => (
                  <div
                    key={notif.id}
                    className={cn(
                      'flex items-start gap-3 p-3 rounded-xl border-l-4 bg-gray-50 hover:bg-gray-100 transition-colors',
                      getNotificationColor(notif.type)
                    )}
                  >
                    <div className="mt-0.5">
                      {getNotificationIcon(notif.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{notif.title}</div>
                      <div className="text-xs text-muted-foreground mt-1">{notif.description}</div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2">
                        <Clock className="h-3 w-3" />
                        {format(notif.timestamp, 'HH:mm')}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

interface KPICardProps {
  title: string
  value: number
  delta?: number
  deltaType?: 'positive' | 'negative' | 'neutral'
  subtext?: string
  icon: React.ComponentType<{ className?: string }>
}

function KPICard({ title, value, delta, deltaType, subtext, icon: Icon }: KPICardProps) {
  return (
    <Card className="bg-white shadow-md border-0 rounded-2xl hover:shadow-lg transition-shadow">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-muted-foreground mb-2">{title}</p>
            <p className="text-3xl font-bold text-gray-900">{value}</p>
            {subtext ? (
              <p className="text-xs text-muted-foreground mt-2">{subtext}</p>
            ) : delta !== undefined ? (
              <div className="flex items-center gap-1 mt-2">
                {deltaType === 'positive' ? (
                  <TrendingUp className="h-3 w-3 text-green-600" />
                ) : deltaType === 'negative' ? (
                  <TrendingDown className="h-3 w-3 text-red-600" />
                ) : null}
                <span className={cn(
                  'text-xs font-medium',
                  deltaType === 'positive' ? 'text-green-600' :
                  deltaType === 'negative' ? 'text-red-600' :
                  'text-gray-600'
                )}>
                  {deltaType === 'positive' ? `↑ ${Math.abs(delta).toFixed(0)}%` :
                   deltaType === 'negative' ? `↓ ${Math.abs(delta).toFixed(0)}%` :
                   delta > 0 ? `↑ ${delta} more` :
                   delta < 0 ? `↓ ${Math.abs(delta)} less` :
                   'No change'} from yesterday
                </span>
              </div>
            ) : null}
          </div>
          <div className="p-4 rounded-xl bg-[#FF6B5C]/10">
            <Icon className="h-6 w-6 text-[#FF6B5C]" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

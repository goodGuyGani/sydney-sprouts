import { useMemo, useState, useEffect, useCallback } from 'react'
import { MapContainer, Marker, Popup, Polyline, CircleMarker, useMap } from 'react-leaflet'
import { Icon, divIcon } from 'leaflet'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { type PsDeliveryroutes, type Salesorder, type Salesorderdetail, type PsStaff, type PsVehicledatabase, psdeliveryroutesEntitySet, salesorderEntitySet, salesorderdetailEntitySet, psstaffEntitySet, psvehicledatabaseEntitySet } from '@/types/dataverse'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { 
  ArrowLeft, 
  Truck,
  User, 
  Navigation, 
  Clock, 
  Route,
  GripVertical,
  Phone,
  MapPin
} from 'lucide-react'
import { getRouteForAllStops } from '@/lib/routeUtils'
import { reverseGeocode } from '@/lib/geocoding'
import { MapTileLayer, type MapStyle } from '@/components/MapStyleSelector'
import { MapBoundsFitter } from '@/components/MapBoundsFitter'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import { useDataverseToken } from '@/hooks/useDataverseToken'
import { dataverseApi } from '@/lib/dataverseApi'
import { format, parseISO, isToday } from 'date-fns'
import { cn } from '@/lib/utils'
import 'leaflet/dist/leaflet.css'

interface RouteDetailsP2Props {
  routeGroupId: string
  routes: PsDeliveryroutes[]
  onBack: () => void
  onNavigateToOrder?: (orderId: string, stopId: string) => void
}

interface StopWithOrders extends PsDeliveryroutes {
  address?: string
  orders?: Salesorder[]
  orderCount?: number
  productLineCount?: number
}

interface RouteMetadata {
  routeId: string
  routeName: string
  routeDate: Date | null
  driver: PsStaff | null
  vehicle: PsVehicledatabase | null
  territory: string | null
  status: 'Planned' | 'In Progress' | 'Completed'
  isEditable: boolean
}

const defaultIcon = new Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

function createStopIcon(sequence: number, isCompleted: boolean, isCurrent: boolean): ReturnType<typeof divIcon> {
  const color = isCompleted ? '#22c55e' : isCurrent ? '#3b82f6' : '#eab308'
  const html = `
    <div style="
      background-color: ${color};
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: 3px solid white;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
      font-size: 12px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    ">
      ${sequence}
    </div>
  `
  
  return divIcon({
    html,
    className: 'custom-stop-icon',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  })
}

function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function calculateTotalDistance(routePositions: [number, number][]): number {
  if (routePositions.length < 2) return 0
  let totalDistance = 0
  for (let i = 0; i < routePositions.length - 1; i++) {
    totalDistance += calculateDistance(
      routePositions[i][0],
      routePositions[i][1],
      routePositions[i + 1][0],
      routePositions[i + 1][1]
    )
  }
  return totalDistance
}

function formatDuration(minutes: number | null | undefined): string {
  if (!minutes) return '-'
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours > 0) {
    return `${hours}h ${mins}m`
  }
  return `${mins}m`
}


function formatTime(dateString: string | null | undefined): string {
  if (!dateString) return '-'
  try {
    return format(parseISO(dateString), 'h:mm a')
  } catch {
    return dateString
  }
}

function SortableStopItem({ 
  stop, 
  index, 
  isSelected, 
  onSelect,
  isEditable,
}: { 
  stop: StopWithOrders
  index: number
  isSelected: boolean
  onSelect: () => void
  isEditable: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stop.ps_deliveryroutesid || `stop-${index}` })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const sequence = stop.ps_sequence ?? index + 1
  const customerName = stop.address ? stop.address.split(',')[0] : 'Unknown Customer'
  const address = stop.ps_address || stop.address || 'Address not available'
  const contactName = stop.ps_contactname || '-'
  const contactPhone = stop.ps_contactphone || '-'
  const orderCount = stop.orderCount || 0
  const productLineCount = stop.productLineCount || 0

  return (
    <div ref={setNodeRef} style={style} className="relative">
      <div
        className={cn(
          'bg-white rounded-xl border cursor-pointer transition-all hover:shadow-md',
          isSelected 
            ? 'border-primary shadow-md bg-primary/5' 
            : 'border-gray-200 hover:border-primary/50',
          isDragging && 'opacity-50'
        )}
        onClick={onSelect}
      >
        <div className="p-4">
          <div className="flex items-start gap-4">
            {isEditable && (
              <div
                {...attributes}
                {...listeners}
                className="mt-1 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
              >
                <GripVertical className="size-4" />
              </div>
            )}
            
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="font-semibold">Stop #{sequence}</Badge>
                    <span className="font-semibold text-base text-gray-900">
                      {customerName || stop.ps_accountname || 'Unknown Location'}
                    </span>
                  </div>
                  
                  {stop.ps_plannedstarttime && stop.ps_plannedendtime && (
                    <div className="flex items-center gap-1.5 text-sm text-gray-600 mb-2">
                      <Clock className="size-4 text-gray-500" />
                      <span>{formatTime(stop.ps_plannedstarttime)} ? {formatTime(stop.ps_plannedendtime)}</span>
                    </div>
                  )}
                  
                  <div className="flex items-start gap-1.5 text-sm text-gray-600 mb-3">
                    <MapPin className="size-4 text-gray-500 mt-0.5 shrink-0" />
                    <span className="line-clamp-2">{address}</span>
                  </div>
                  
                  {(orderCount > 0 || productLineCount > 0) && (
                    <div className="text-sm text-gray-600 mb-3">
                      <span className="font-medium">Delivery ? </span>
                      {orderCount > 0 && (
                        <span>{orderCount} order{orderCount !== 1 ? 's' : ''}</span>
                      )}
                      {orderCount > 0 && productLineCount > 0 && <span>, </span>}
                      {productLineCount > 0 && (
                        <span>{productLineCount} item{productLineCount !== 1 ? 's' : ''}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-3 border-t border-gray-100">
                <div>
                  <div className="text-xs text-gray-500 mb-1">Contact</div>
                  <div className="flex items-center gap-2">
                    <User className="size-3.5 text-gray-400" />
                    <span className="text-sm font-medium text-gray-900">{contactName}</span>
                  </div>
                  {contactPhone !== '-' && (
                    <div className="flex items-center gap-2 mt-1">
                      <Phone className="size-3.5 text-gray-400" />
                      <span className="text-sm text-gray-600">{contactPhone}</span>
                    </div>
                  )}
                </div>
                
                <div>
                  <div className="text-xs text-gray-500 mb-1">Products</div>
                  <div className="text-sm text-gray-900">
                    <span className="font-medium">{productLineCount || 0}</span> product line{(productLineCount || 0) !== 1 ? 's' : ''}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    <span className="font-medium">{productLineCount || 0}</span> items in total
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MapCenterer({ center }: { center: [number, number] }) {
  const map = useMap()
  useEffect(() => {
    map.setView(center, map.getZoom())
  }, [center, map])
  return null
}

export function RouteDetailsP2({ routeGroupId: _routeGroupId, routes, onBack, onNavigateToOrder }: RouteDetailsP2Props) {
  const { getAccessToken } = useDataverseToken()
  const [mapStyle] = useState<MapStyle>('osm')
  const [stops, setStops] = useState<StopWithOrders[]>([])
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null)
  const [loadingAddresses, setLoadingAddresses] = useState(false)
  const [loadingOrders, setLoadingOrders] = useState(false)
  const [loadingMetadata, setLoadingMetadata] = useState(false)
  const [routeMetadata, setRouteMetadata] = useState<RouteMetadata | null>(null)
  const [driver, setDriver] = useState<PsStaff | null>(null)
  const [vehicle, setVehicle] = useState<PsVehicledatabase | null>(null)
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null)
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null)
  const [isLocating, setIsLocating] = useState(false)
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const sortedStops = useMemo(() => {
    return [...stops].sort((a, b) => {
      const seqA = a.ps_sequence ?? 0
      const seqB = b.ps_sequence ?? 0
      return seqA - seqB
    })
  }, [stops])

  const routePositions = useMemo(() => {
    return sortedStops
      .filter((stop) => stop.ps_sitelat != null && stop.ps_sitelong != null)
      .map((stop) => [stop.ps_sitelat!, stop.ps_sitelong!] as [number, number])
  }, [sortedStops])

  const [roadRoutePositions, setRoadRoutePositions] = useState<[number, number][]>([])
  const [loadingRoute, setLoadingRoute] = useState(false)

  useEffect(() => {
    if (routePositions.length > 1) {
      const fetchRoute = async () => {
        setLoadingRoute(true)
        try {
          const positions = await getRouteForAllStops(routePositions)
          setRoadRoutePositions(positions)
        } catch {
          setRoadRoutePositions(routePositions)
        } finally {
          setLoadingRoute(false)
        }
      }
      void fetchRoute()
    } else {
      setRoadRoutePositions(routePositions)
    }
  }, [routePositions])

  useEffect(() => {
    const initializeStops = async () => {
      setLoadingAddresses(true)
      const stopsWithAddr: StopWithOrders[] = await Promise.all(
        routes.map(async (route) => {
          if (route.ps_sitelat == null || route.ps_sitelong == null) {
            return { ...route, address: route.ps_address || undefined }
          }
          
          try {
            const address = await reverseGeocode(route.ps_sitelat, route.ps_sitelong)
            return { ...route, address: address || route.ps_address || undefined }
          } catch {
            return { ...route, address: route.ps_address || undefined }
          }
        })
      )
      setStops(stopsWithAddr)
      setLoadingAddresses(false)
    }

    if (routes.length > 0) {
      void initializeStops()
    }
  }, [routes])

  useEffect(() => {
    const fetchRouteMetadata = async () => {
      if (routes.length === 0) return
      
      setLoadingMetadata(true)
      try {
        const token = await getAccessToken()
        if (!token) return

        const firstRoute = routes[0]
        const routeDate = firstRoute.ps_route_date ? parseISO(firstRoute.ps_route_date) : null
        const isEditable = routeDate ? (isToday(routeDate) && firstRoute.statecode !== 2) : false
        
        const status: RouteMetadata['status'] = 
          firstRoute.statecode === 2 ? 'Completed' :
          firstRoute.statecode === 1 ? 'In Progress' :
          'Planned'

        const routeId = firstRoute.ps_routegroupid || firstRoute.ps_routename || `RT-${firstRoute.ps_deliveryroutesid?.slice(0, 8)}`
        const routeName = firstRoute.ps_routename || routeId

        let driverData: PsStaff | null = null
        let vehicleData: PsVehicledatabase | null = null

        if (firstRoute.ps_driver) {
          try {
            const driverResponse = await dataverseApi.queryTable<PsStaff>(
              token,
              psstaffEntitySet,
              `$filter=ps_staffid eq ${firstRoute.ps_driver}&$select=ps_staffid,ps_name,ps_firstname,ps_lastname,ps_personalemail`
            )
            driverData = driverResponse[0] || null
          } catch {
            driverData = null
          }
        }

        if (firstRoute.ps_vehicle_route) {
          try {
            const vehicleResponse = await dataverseApi.queryTable<PsVehicledatabase>(
              token,
              psvehicledatabaseEntitySet,
              `$filter=ps_vehicledatabaseid eq ${firstRoute.ps_vehicle_route}&$select=ps_vehicledatabaseid,ps_nickname,ps_make,ps_model,ps_plate`
            )
            vehicleData = vehicleResponse[0] || null
          } catch {
            vehicleData = null
          }
        }

        setDriver(driverData)
        setVehicle(vehicleData)

        setRouteMetadata({
          routeId,
          routeName,
          routeDate,
          driver: driverData,
          vehicle: vehicleData,
          territory: null,
          status,
          isEditable,
        })
      } catch (error) {
        toast.error('Failed to load route metadata', {
          description: error instanceof Error ? error.message : 'Unknown error',
        })
      } finally {
        setLoadingMetadata(false)
      }
    }

    void fetchRouteMetadata()
  }, [routes, getAccessToken])

  const routeIdsForOrders = useMemo(() => {
    return routes
      .map(r => r.ps_deliveryroutesid)
      .filter((id): id is string => id !== null && id !== undefined)
  }, [routes])

  useEffect(() => {
    const fetchOrders = async () => {
      if (routes.length === 0 || stops.length === 0 || routeIdsForOrders.length === 0) return
      
      setLoadingOrders(true)
      try {
        const token = await getAccessToken()
        if (!token) {
          setLoadingOrders(false)
          return
        }

        const filter = routeIdsForOrders.map(id => `_ps_deliveryroute_value eq ${id}`).join(' or ')
        const orders = await dataverseApi.queryTable<Salesorder>(
          token,
          salesorderEntitySet,
          `$filter=${filter}&$select=salesorderid,ps_deliveryroute,ps_deliverystopsequence`
        )

        const orderIds = orders.map(o => o.salesorderid).filter((id): id is string => id !== null && id !== undefined)
        
        const orderDetailsMap = new Map<string, number>()
        if (orderIds.length > 0) {
          try {
            const orderDetailsFilter = orderIds.map(id => `salesorderid eq ${id}`).join(' or ')
            const orderDetails = await dataverseApi.queryTable<Salesorderdetail>(
              token,
              salesorderdetailEntitySet,
              `$filter=${orderDetailsFilter}&$select=salesorderdetailid,salesorderid`
            )
            
            orderDetails.forEach(detail => {
              if (detail.salesorderid) {
                const count = orderDetailsMap.get(detail.salesorderid) || 0
                orderDetailsMap.set(detail.salesorderid, count + 1)
              }
            })
          } catch {
          }
        }

        const stopsWithOrders = stops.map(stop => {
          const stopOrders = orders.filter(
            order => order.ps_deliveryroute === stop.ps_deliveryroutesid
          )
          const orderCount = stopOrders.length
          const productLineCount = stopOrders.reduce((sum, order) => {
            if (order.salesorderid) {
              return sum + (orderDetailsMap.get(order.salesorderid) || 0)
            }
            return sum
          }, 0)
          return {
            ...stop,
            orders: stopOrders,
            orderCount,
            productLineCount,
          }
        })

        setStops(stopsWithOrders)
      } catch (error) {
        toast.error('Failed to load orders', {
          description: error instanceof Error ? error.message : 'Unknown error',
        })
      } finally {
        setLoadingOrders(false)
      }
    }

    void fetchOrders()
  }, [routes.length, routeIdsForOrders, stops.length, getAccessToken])

  const center: [number, number] = routePositions.length > 0
    ? routePositions[0]
    : [14.5995, 120.9842]

  useEffect(() => {
    if (!mapCenter) {
      setMapCenter(center)
    }
  }, [center, mapCenter])

  const totalDistance = useMemo(() => {
    if (roadRoutePositions.length < 2) return calculateTotalDistance(routePositions)
    return calculateTotalDistance(roadRoutePositions)
  }, [roadRoutePositions, routePositions])

  const totalOrders = useMemo(() => {
    return stops.reduce((sum, stop) => sum + (stop.orderCount || 0), 0)
  }, [stops])

  const estimatedDuration = useMemo(() => {
    const firstRoute = routes[0]
    return firstRoute?.ps_estimatedduration || null
  }, [routes])

  const plannedStartTime = useMemo(() => {
    const firstRoute = routes[0]
    return firstRoute?.ps_plannedstarttime || null
  }, [routes])

  const plannedEndTime = useMemo(() => {
    const firstRoute = routes[0]
    return firstRoute?.ps_plannedendtime || null
  }, [routes])

  const capacityUsage = useMemo(() => {
    const firstRoute = routes[0]
    return firstRoute?.ps_capacityusage || null
  }, [routes])

  const selectedStop = stops.find((s) => s.ps_deliveryroutesid === selectedStopId)
  const selectedPosition: [number, number] | null = selectedStop && selectedStop.ps_sitelat != null && selectedStop.ps_sitelong != null
    ? [selectedStop.ps_sitelat, selectedStop.ps_sitelong]
    : null

  const handleStopClick = useCallback((stop: StopWithOrders) => {
    setSelectedStopId(stop.ps_deliveryroutesid || null)
    if (onNavigateToOrder && stop.orders && stop.orders.length > 0) {
      onNavigateToOrder(stop.orders[0].salesorderid || '', stop.ps_deliveryroutesid || '')
    }
  }, [onNavigateToOrder])

  const requestUserLocation = useCallback(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined' || !navigator.geolocation) {
      toast.error('Location not supported', {
        description: 'Your device or browser blocked GPS access.',
      })
      return
    }

    setIsLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords: [number, number] = [position.coords.latitude, position.coords.longitude]
        setUserLocation(coords)
        setMapCenter(coords)
        toast.success('Location detected', {
          description: 'Centered on your current position.',
        })
        setIsLocating(false)
      },
      (error) => {
        const errorMessage =
          error.code === error.PERMISSION_DENIED
            ? 'Permission denied. Please allow location access.'
            : 'Unable to get your location. Try again.'
        toast.error('Location unavailable', {
          description: errorMessage,
        })
        setIsLocating(false)
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    )
  }, [])

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event

    if (!over || active.id === over.id) return

    if (!routeMetadata?.isEditable) {
      toast.error('Cannot reorder stops', {
        description: 'This route is read-only',
      })
      return
    }

    const oldIndex = sortedStops.findIndex(
      (stop) => stop.ps_deliveryroutesid === active.id
    )
    const newIndex = sortedStops.findIndex(
      (stop) => stop.ps_deliveryroutesid === over.id
    )

    if (oldIndex === -1 || newIndex === -1) return

    const newStops = arrayMove(sortedStops, oldIndex, newIndex)
    const updatedStops = newStops.map((stop, index) => ({
      ...stop,
      ps_sequence: index + 1,
    }))

    setStops(updatedStops)

    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Failed to get access token')

      await Promise.all(
        updatedStops.map((stop, index) => {
          if (!stop.ps_deliveryroutesid) return Promise.resolve()
          return dataverseApi.updateRecord(
            token,
            psdeliveryroutesEntitySet,
            stop.ps_deliveryroutesid,
            { ps_sequence: index + 1 }
          )
        })
      )

      toast.success('Route reordered', {
        description: 'Stop sequence updated successfully',
      })
    } catch (error) {
      toast.error('Failed to save route order', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
      setStops(sortedStops)
    }
  }

  if (loadingMetadata || routes.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <Spinner className="size-8" />
          <p className="text-muted-foreground">Loading route details...</p>
        </div>
      </div>
    )
  }

  if (!routeMetadata) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Route not found</p>
      </div>
    )
  }

  const isInProgress = routeMetadata.status === 'In Progress'

  const routeIdFormatted = routeMetadata.routeId.startsWith('RT-') 
    ? routeMetadata.routeId 
    : `RT-${routeMetadata.routeId.slice(-8).toUpperCase().replace(/-/g, '')}`

  return (
    <div className="min-h-screen bg-slate-50 p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="hover:bg-white">
          <ArrowLeft className="h-4 w-4 mr-2" />
        </Button>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-gray-900">{routeIdFormatted}</h1>
          <Badge 
            variant="outline" 
            className={cn(
              'px-3 py-1 rounded-full font-medium',
              routeMetadata.status === 'In Progress' 
                ? 'bg-orange-100 text-orange-700 border-orange-300' 
                : routeMetadata.status === 'Completed'
                ? 'bg-green-100 text-green-700 border-green-300'
                : 'bg-blue-100 text-blue-700 border-blue-300'
            )}
          >
            {routeMetadata.status}
          </Badge>
        </div>
        {routeMetadata.routeDate && (
          <p className="text-sm text-muted-foreground ml-4">
            Scheduled for {format(routeMetadata.routeDate, 'MMMM d, yyyy')}
            {plannedStartTime && plannedEndTime && (
              <> ? {formatTime(plannedStartTime)} ? {formatTime(plannedEndTime)}</>
            )}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-white shadow-md border-0 rounded-2xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Truck className="h-5 w-5" />
              Vehicle Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="text-sm text-muted-foreground mb-1">Truck ID</div>
              <div className="font-semibold text-base">
                {vehicle?.ps_nickname || routes[0]?.ps_vehiclename || 'TRK-N/A'}
              </div>
            </div>
            {vehicle && (
              <>
                {(vehicle.ps_make || vehicle.ps_model) && (
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Model</div>
                    <div className="font-semibold text-base">
                      {[vehicle.ps_make, vehicle.ps_model].filter(Boolean).join(' ') || '-'}
                    </div>
                  </div>
                )}
                {vehicle.ps_plate && (
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">License Plate</div>
                    <div className="font-semibold text-base">{vehicle.ps_plate}</div>
                  </div>
                )}
              </>
            )}
            <div className="pt-2 border-t">
              <div className="text-sm text-orange-600 font-medium">
                Capacity: {capacityUsage !== null ? `${capacityUsage.toFixed(0)}%` : 'Not available yet'}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white shadow-md border-0 rounded-2xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <User className="h-5 w-5" />
              Driver Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="text-sm text-muted-foreground mb-1">Driver</div>
              <div className="font-semibold text-base">
                {driver?.ps_name || 
                 (driver?.ps_firstname && driver?.ps_lastname
                   ? `${driver.ps_firstname} ${driver.ps_lastname}` 
                   : routes[0]?.ps_driver_name || 'Not assigned')}
              </div>
            </div>
            {driver?.ps_personalemail && (
              <div>
                <div className="text-sm text-muted-foreground mb-1">Phone</div>
                <div className="font-semibold text-base">{driver.ps_personalemail}</div>
              </div>
            )}
            {driver?.ps_staffnumber && (
              <div>
                <div className="text-sm text-muted-foreground mb-1">Employee ID</div>
                <div className="font-semibold text-base">EMP-{driver.ps_staffnumber}</div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white shadow-md border-0 rounded-2xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Route className="h-5 w-5" />
              Route Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="text-sm text-muted-foreground mb-1">Total Distance</div>
              <div className="font-semibold text-base">
                {((routes[0]?.ps_estimateddistance || totalDistance || 0) * 0.621371).toFixed(1)} miles
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Estimated Duration</div>
              <div className="font-semibold text-base">
                {formatDuration(estimatedDuration)}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Stops</div>
              <div className="font-semibold text-base">{sortedStops.length}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Orders</div>
              <div className="font-semibold text-base">{totalOrders}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white shadow-md border-0 rounded-2xl">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-semibold">Route Map</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="relative h-[600px] w-full rounded-lg overflow-hidden">
            {loadingRoute && routePositions.length > 1 && (
              <div className="absolute top-4 left-4 z-50 bg-background/90 backdrop-blur p-2 rounded-md border shadow-md">
                <div className="flex items-center gap-2 text-sm">
                  <Spinner className="size-4" />
                  <span>Calculating road route...</span>
                </div>
              </div>
            )}
            <div className="absolute top-4 left-4 z-1000 flex flex-col gap-2">
              <Button
                size="sm"
                variant="secondary"
                className="shadow-md bg-background/80 backdrop-blur border"
                disabled={isLocating}
                onClick={requestUserLocation}
              >
                {isLocating ? (
                  <>
                    <Spinner className="size-4 mr-2" />
                    Locating...
                  </>
                ) : (
                  <>
                    <Navigation className="size-4 mr-2" />
                    Use my location
                  </>
                )}
              </Button>
            </div>
            <div className="absolute top-4 right-4 z-1000">
              <Card className="p-3 bg-white/95 backdrop-blur shadow-lg rounded-xl border-0">
                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                    <span className="text-gray-700 font-medium">Current Route</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    <span className="text-gray-700 font-medium">Completed Stops</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                    <span className="text-gray-700 font-medium">Pending Stops</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                    <span className="text-gray-700 font-medium">Current Location</span>
                  </div>
                </div>
              </Card>
            </div>
            <MapContainer
              center={mapCenter || center}
              zoom={mapCenter ? 15 : 13}
              style={{ height: '100%', width: '100%' }}
            >
              <MapTileLayer style={mapStyle} />
              {mapCenter && <MapCenterer center={mapCenter} />}
              {routePositions.length > 0 && (
                <MapBoundsFitter
                  positions={[...routePositions, ...(userLocation ? [userLocation] : [])]}
                  padding={[50, 50]}
                />
              )}
              {selectedPosition && (
                <Marker position={selectedPosition} icon={defaultIcon}>
                  <Popup>
                    <div className="font-semibold">Selected Stop</div>
                  </Popup>
                </Marker>
              )}
              
              {roadRoutePositions.length > 1 && (
                <Polyline
                  positions={roadRoutePositions}
                  pathOptions={{ color: '#ef4444', weight: 4, opacity: 0.8 }}
                />
              )}

              {sortedStops.map((stop, index) => {
                if (stop.ps_sitelat == null || stop.ps_sitelong == null) return null
                
                const sequence = stop.ps_sequence ?? index + 1
                const isCompleted = stop.ps_deliveryconfirmationstatus === 2
                const isCurrent = index === 0 && isInProgress && !isCompleted
                
                return (
                  <Marker
                    key={stop.ps_deliveryroutesid}
                    position={[stop.ps_sitelat, stop.ps_sitelong]}
                    icon={createStopIcon(sequence, isCompleted, isCurrent)}
                    eventHandlers={{
                      click: () => {
                        handleStopClick(stop)
                      },
                    }}
                  >
                    <Popup>
                      <div className="space-y-1">
                        <div className="font-semibold">Stop #{sequence}</div>
                        <div className="text-sm">{stop.ps_accountname || stop.address?.split(',')[0] || 'Unknown'}</div>
                        <div className="text-xs text-muted-foreground">{stop.ps_address || stop.address || 'Address not available'}</div>
                      </div>
                    </Popup>
                  </Marker>
                )
              })}
              {userLocation && (
                <CircleMarker
                  center={userLocation}
                  radius={10}
                  pathOptions={{ color: '#0ea5e9', fillColor: '#0ea5e9', fillOpacity: 0.4, weight: 2 }}
                >
                  <Popup>
                    <div className="space-y-1">
                      <div className="font-semibold">Your location</div>
                      <div className="text-xs font-mono text-muted-foreground">
                        {userLocation[0].toFixed(6)}, {userLocation[1].toFixed(6)}
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              )}
            </MapContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white shadow-md border-0 rounded-2xl">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-semibold">Delivery Stops</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[600px]">
            <div className="p-4 space-y-2">
                {loadingAddresses || loadingOrders ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="flex flex-col items-center gap-2">
                      <Spinner className="size-6" />
                      <p className="text-sm text-muted-foreground">Loading stops...</p>
                    </div>
                  </div>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={sortedStops.map(s => s.ps_deliveryroutesid || '')}
                      strategy={verticalListSortingStrategy}
                    >
                      {sortedStops.map((stop, index) => {
                        const isSelected = stop.ps_deliveryroutesid === selectedStopId

                        return (
                          <SortableStopItem
                            key={stop.ps_deliveryroutesid}
                            stop={stop}
                            index={index}
                            isSelected={isSelected}
                            onSelect={() => handleStopClick(stop)}
                            isEditable={routeMetadata.isEditable}
                          />
                        )
                      })}
                    </SortableContext>
                  </DndContext>
                )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}

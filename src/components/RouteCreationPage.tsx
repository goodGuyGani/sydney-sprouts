import { useState, useCallback, useMemo, useEffect } from 'react'
import { MapContainer, Marker, Popup, Polyline, useMapEvents, CircleMarker } from 'react-leaflet'
import { Icon } from 'leaflet'
import { format } from 'date-fns'
import { useDataverseToken } from '@/hooks/useDataverseToken'
import { dataverseApi } from '@/lib/dataverseApi'
import {
  type PsDeliveryroutes,
  psdeliveryroutesEntitySet,
  type PsVehicledatabase,
  psvehicledatabaseEntitySet,
  type PsStaff,
  psstaffEntitySet,
  type Account,
  accountEntitySet,
  type PsTerritorygroup,
  psterritorygroupEntitySet,
} from '@/types/dataverse'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  Save,
  RotateCcw,
  MapPin,
  Calendar as CalendarIcon,
  Truck,
  User,
  Building2,
  Route,
  X,
  Phone,
  Navigation,
} from 'lucide-react'
import { getRouteForAllStops } from '@/lib/routeUtils'
import { reverseGeocode } from '@/lib/geocoding'
import { cn } from '@/lib/utils'
import { MapTileLayer } from '@/components/MapStyleSelector'
import { MapBoundsFitter } from '@/components/MapBoundsFitter'
import 'leaflet/dist/leaflet.css'
import 'leaflet-geosearch/assets/css/leaflet.css'

function formatLookupField(entitySetName: string, guid: string): string {
  return `/${entitySetName}(${guid})`
}

interface Stop {
  id: string
  sequence: number
  lat: number
  lng: number
  accountId?: string
  accountName?: string
  address?: string
  contactName?: string
  contactPhone?: string
}

interface RouteCreationPageProps {
  onSaveSuccess?: () => void
}

function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => {
      onMapClick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
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

function optimizeRouteSequence(stops: Stop[]): Stop[] {
  if (stops.length <= 1) return stops

  const unvisited = [...stops]
  const optimized: Stop[] = []
  
  let current = unvisited.shift()!
  optimized.push({ ...current, sequence: 1 })

  while (unvisited.length > 0) {
    let nearestIndex = 0
    let nearestDistance = calculateDistance(
      current.lat,
      current.lng,
      unvisited[0].lat,
      unvisited[0].lng
    )

    for (let i = 1; i < unvisited.length; i++) {
      const distance = calculateDistance(
        current.lat,
        current.lng,
        unvisited[i].lat,
        unvisited[i].lng
      )
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearestIndex = i
      }
    }

    current = unvisited.splice(nearestIndex, 1)[0]
    optimized.push({ ...current, sequence: optimized.length + 1 })
  }

  return optimized
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

export function RouteCreationPage({ onSaveSuccess }: RouteCreationPageProps) {
  const { getAccessToken } = useDataverseToken()
  const [stops, setStops] = useState<Stop[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [isLocating, setIsLocating] = useState(false)
  
  const [routeName, setRouteName] = useState<string>('')
  const [routeDate, setRouteDate] = useState<Date>(new Date())
  const [routeGroupId, setRouteGroupId] = useState<string>('')
  const [plannedStartTime, setPlannedStartTime] = useState<string>('08:00')
  const [plannedEndTime, setPlannedEndTime] = useState<string>('17:00')
  
  const [vehicleId, setVehicleId] = useState<string>('')
  const [driverId, setDriverId] = useState<string>('')
  const [territoryGroupId, setTerritoryGroupId] = useState<string>('')
  
  const [vehicles, setVehicles] = useState<PsVehicledatabase[]>([])
  const [drivers, setDrivers] = useState<PsStaff[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [territoryGroups, setTerritoryGroups] = useState<PsTerritorygroup[]>([])
  
  const [loadingVehicles, setLoadingVehicles] = useState(false)
  const [loadingDrivers, setLoadingDrivers] = useState(false)
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [loadingTerritoryGroups, setLoadingTerritoryGroups] = useState(false)
  
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null)
  const [roadRoutePositions, setRoadRoutePositions] = useState<[number, number][]>([])
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null)
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null)

  const optimizedStops = useMemo(() => {
    return optimizeRouteSequence(stops)
  }, [stops])

  useEffect(() => {
    const fetchVehicles = async () => {
      setLoadingVehicles(true)
      try {
        const token = await getAccessToken()
        if (!token) return

        const vehicleData = await dataverseApi.queryTable<PsVehicledatabase>(
          token,
          psvehicledatabaseEntitySet,
          '$select=ps_vehicledatabaseid,ps_nickname,ps_plate,ps_make,ps_model&$filter=ps_assettype eq 125630000&$orderby=ps_nickname asc,ps_plate asc'
        )
        setVehicles(vehicleData)
      } catch (error) {
        toast.error('Failed to load vehicles', {
          description: error instanceof Error ? error.message : 'Unknown error',
        })
      } finally {
        setLoadingVehicles(false)
      }
    }

    void fetchVehicles()
  }, [getAccessToken])

  useEffect(() => {
    const fetchDrivers = async () => {
      setLoadingDrivers(true)
      try {
        const token = await getAccessToken()
        if (!token) return

        const driverData = await dataverseApi.queryTable<PsStaff>(
          token,
          psstaffEntitySet,
          '$select=ps_staffid,ps_name,ps_firstname,ps_lastname,ps_staffnumber&$orderby=ps_name asc'
        )
        setDrivers(driverData)
      } catch (error) {
        toast.error('Failed to load drivers', {
          description: error instanceof Error ? error.message : 'Unknown error',
        })
      } finally {
        setLoadingDrivers(false)
      }
    }

    void fetchDrivers()
  }, [getAccessToken])

  useEffect(() => {
    const fetchAccounts = async () => {
      setLoadingAccounts(true)
      try {
        const token = await getAccessToken()
        if (!token) return

        const accountData = await dataverseApi.queryTable<Account>(
          token,
          accountEntitySet,
          '$select=accountid,name&$orderby=name asc&$top=500'
        )
        setAccounts(accountData)
      } catch (error) {
        toast.error('Failed to load accounts', {
          description: error instanceof Error ? error.message : 'Unknown error',
        })
      } finally {
        setLoadingAccounts(false)
      }
    }

    void fetchAccounts()
  }, [getAccessToken])

  useEffect(() => {
    const fetchTerritoryGroups = async () => {
      setLoadingTerritoryGroups(true)
      try {
        const token = await getAccessToken()
        if (!token) return

        const territoryData = await dataverseApi.queryTable<PsTerritorygroup>(
          token,
          psterritorygroupEntitySet,
          '$select=ps_territorygroupid,ps_name,ps_id&$orderby=ps_name asc'
        )
        setTerritoryGroups(territoryData)
      } catch (error) {
        toast.error('Failed to load territory groups', {
          description: error instanceof Error ? error.message : 'Unknown error',
        })
      } finally {
        setLoadingTerritoryGroups(false)
      }
    }

    void fetchTerritoryGroups()
  }, [getAccessToken])

  useEffect(() => {
    if (optimizedStops.length < 2) {
      setRoadRoutePositions([])
      return
    }

    const routeLinePositions = optimizedStops.map((stop) => [stop.lat, stop.lng] as [number, number])
    
    void getRouteForAllStops(routeLinePositions)
      .then((positions) => {
        setRoadRoutePositions(positions)
      })
      .catch(() => {
        setRoadRoutePositions(routeLinePositions)
      })
  }, [optimizedStops])

  useEffect(() => {
    const fetchAddressesForStops = async () => {
      const stopsNeedingAddress = stops.filter((stop) => !stop.address)
      
      if (stopsNeedingAddress.length === 0) return

      for (const stop of stopsNeedingAddress) {
        try {
          const address = await reverseGeocode(stop.lat, stop.lng)
          if (address) {
            setStops((prev) =>
              prev.map((s) => (s.id === stop.id ? { ...s, address } : s))
            )
          }
        } catch {
          // Silent fail - address is optional
        }
      }
    }

    void fetchAddressesForStops()
  }, [stops])

  const handleMapClick = useCallback((lat: number, lng: number) => {
    const newStop: Stop = {
      id: `stop-${Date.now()}-${Math.random()}`,
      sequence: stops.length + 1,
      lat,
      lng,
    }
    setStops((prev) => [...prev, newStop])
    
    toast.success('Stop added', {
      description: 'Fetching address...',
    })
    
    void reverseGeocode(lat, lng)
      .then((address) => {
        if (address) {
          setStops((prev) =>
            prev.map((stop) => (stop.id === newStop.id ? { ...stop, address } : stop))
          )
        }
      })
      .catch(() => {
        // Silent fail - address is optional
      })
  }, [stops.length])

  const handleRemoveStop = useCallback((id: string) => {
    setStops((prev) => prev.filter((stop) => stop.id !== id))
    if (selectedStopId === id) {
      setSelectedStopId(null)
    }
    toast.info('Stop removed')
  }, [selectedStopId])

  const handleUpdateStop = useCallback((id: string, updates: Partial<Stop>) => {
    setStops((prev) =>
      prev.map((stop) => (stop.id === id ? { ...stop, ...updates } : stop))
    )
  }, [])

  const totalDistance = useMemo(() => {
    if (roadRoutePositions.length < 2) {
      let distance = 0
      for (let i = 0; i < optimizedStops.length - 1; i++) {
        distance += calculateDistance(
          optimizedStops[i].lat,
          optimizedStops[i].lng,
          optimizedStops[i + 1].lat,
          optimizedStops[i + 1].lng
        )
      }
      return distance
    }
    
    let distance = 0
    for (let i = 0; i < roadRoutePositions.length - 1; i++) {
      distance += calculateDistance(
        roadRoutePositions[i][0],
        roadRoutePositions[i][1],
        roadRoutePositions[i + 1][0],
        roadRoutePositions[i + 1][1]
      )
    }
    return distance
  }, [roadRoutePositions, optimizedStops])

  const estimatedDuration = useMemo(() => {
    const avgSpeed = 50
    const hours = totalDistance / avgSpeed
    const minutes = Math.round(hours * 60)
    return { hours: Math.floor(minutes / 60), minutes: minutes % 60 }
  }, [totalDistance])

  const selectedVehicle = useMemo(() => {
    return vehicles.find((v) => v.ps_vehicledatabaseid === vehicleId)
  }, [vehicles, vehicleId])

  const selectedDriver = useMemo(() => {
    return drivers.find((d) => d.ps_staffid === driverId)
  }, [drivers, driverId])

  const handleClearAll = useCallback(() => {
    setStops([])
    setRouteName('')
    setRouteDate(new Date())
    setRouteGroupId('')
    setPlannedStartTime('08:00')
    setPlannedEndTime('17:00')
    setVehicleId('')
    setDriverId('')
    setTerritoryGroupId('')
    setSelectedStopId(null)
    setMapCenter(null)
    toast.info('All data cleared')
  }, [])

  const handleSave = useCallback(async () => {
    if (optimizedStops.length === 0) {
      toast.error('No stops to save', {
        description: 'Add at least one stop on the map',
      })
      return
    }

    if (!vehicleId) {
      toast.error('Vehicle required', {
        description: 'Please select a vehicle for this route',
      })
      return
    }

    if (!driverId) {
      toast.error('Driver required', {
        description: 'Please select a driver for this route',
      })
      return
    }

    if (!routeName.trim()) {
      toast.error('Route name required', {
        description: 'Please enter a route name',
      })
      return
    }

    setIsSaving(true)

    try {
      const token = await getAccessToken()
      if (!token) {
        throw new Error('Failed to get access token')
      }

      const finalRouteGroupId = routeGroupId || `ROUTE-${Date.now()}`
      const finalRouteName = routeName.trim()
      const routeDateStr = format(routeDate, 'yyyy-MM-dd')
      
      const [startHours, startMinutes] = plannedStartTime.split(':').map(Number)
      const [endHours, endMinutes] = plannedEndTime.split(':').map(Number)
      const startDateTime = new Date(routeDate)
      startDateTime.setHours(startHours, startMinutes, 0, 0)
      const endDateTime = new Date(routeDate)
      endDateTime.setHours(endHours, endMinutes, 0, 0)
      
      const plannedStartTimeStr = startDateTime.toISOString()
      const plannedEndTimeStr = endDateTime.toISOString()

      const routesToCreate = optimizedStops.map((stop) => {
        const routeData: Record<string, unknown> = {
          ps_sequence: stop.sequence,
          ps_sitelat: stop.lat,
          ps_sitelong: stop.lng,
          ps_route_date: routeDateStr,
          ps_driver_name: selectedDriver?.ps_name ?? '',
          ps_routename: finalRouteName,
          ps_routegroupid: finalRouteGroupId,
          ps_plannedstarttime: plannedStartTimeStr,
          ps_plannedendtime: plannedEndTimeStr,
          ps_estimateddistance: totalDistance,
          ps_estimatedduration: estimatedDuration.hours * 60 + estimatedDuration.minutes,
          statecode: 0,
          ps_deliveryconfirmationstatus: 1,
          ps_vehiclename: selectedVehicle?.ps_vehicledatabaseid ?? '',
        }

        if (vehicleId) {
          routeData['ps_vehicle_route@odata.bind'] = formatLookupField(psvehicledatabaseEntitySet, vehicleId)
        }

        if (driverId) {
          routeData['ps_driver@odata.bind'] = formatLookupField(psstaffEntitySet, driverId)
        }

        if (stop.accountId) {
          routeData['ps_account@odata.bind'] = formatLookupField(accountEntitySet, stop.accountId)
        }

        if (stop.address) {
          routeData['ps_address'] = stop.address
        }

        if (stop.contactName) {
          routeData['ps_contactname'] = stop.contactName
        }

        if (stop.contactPhone) {
          routeData['ps_contactphone'] = stop.contactPhone
        }

        if (territoryGroupId) {
          routeData['ps_territorygroup@odata.bind'] = formatLookupField(psterritorygroupEntitySet, territoryGroupId)
        }

        return routeData
      })

      const createPromises = routesToCreate.map((route) =>
        dataverseApi.createRecord<PsDeliveryroutes>(token, psdeliveryroutesEntitySet, route as Partial<PsDeliveryroutes>)
      )

      await Promise.all(createPromises)

      toast.success('Route created successfully', {
        description: `Created route with ${routesToCreate.length} stop${routesToCreate.length !== 1 ? 's' : ''}`,
      })

      handleClearAll()
      onSaveSuccess?.()
    } catch (error) {
      toast.error('Failed to create route', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setIsSaving(false)
    }
  }, [
    optimizedStops,
    vehicleId,
    driverId,
    routeName,
    routeDate,
    routeGroupId,
    plannedStartTime,
    plannedEndTime,
    territoryGroupId,
    totalDistance,
    estimatedDuration,
    selectedDriver,
    selectedVehicle,
    getAccessToken,
    handleClearAll,
    onSaveSuccess,
  ])

  const selectedStop = useMemo(() => {
    return stops.find((s) => s.id === selectedStopId)
  }, [stops, selectedStopId])

  const getDriverDisplayName = (driver: PsStaff) => {
    return driver.ps_name || `${driver.ps_firstname || ''} ${driver.ps_lastname || ''}`.trim() || 'Unknown'
  }

  const requestUserLocation = useCallback((showToast = true) => {
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
        if (showToast) {
          toast.success('Location detected', {
            description: 'Centered on your current position.',
          })
        }
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

  useEffect(() => {
    if (mapCenter) {
      return
    }

    if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && navigator.geolocation) {
      requestUserLocation(false)
    } else {
      setMapCenter([14.5995, 120.9842])
    }
  }, [mapCenter, requestUserLocation])

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Create Delivery Route</h1>
          <p className="text-muted-foreground mt-2">
            Plan a new delivery route with stops, vehicle, and driver assignments
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={handleClearAll} disabled={isSaving}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Clear All
          </Button>
          <Button onClick={() => { void handleSave() }} disabled={isSaving || optimizedStops.length === 0}>
            {isSaving ? (
              <>
                <Spinner className="h-4 w-4 mr-2" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Create Route
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
        <div className="lg:col-span-2 space-y-6 w-full">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Route Map
              </CardTitle>
              <CardDescription>Click on the map to add delivery stops</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[600px] w-full rounded-lg overflow-hidden border relative">
                <div className="absolute top-4 left-4 z-1000">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="shadow-md bg-background/80 backdrop-blur border"
                    disabled={isLocating}
                    onClick={() => requestUserLocation(true)}
                  >
                    {isLocating ? (
                      <>
                        <Spinner className="h-4 w-4 mr-2" />
                        Locating...
                      </>
                    ) : (
                      <>
                        <Navigation className="h-4 w-4 mr-2" />
                        Use my location
                      </>
                    )}
                  </Button>
                </div>
                {mapCenter ? (
                  <MapContainer
                    center={mapCenter}
                    zoom={12}
                    className="h-full w-full"
                    key={`${mapCenter[0]}-${mapCenter[1]}`}
                  >
                    <MapTileLayer style="osm" />
                    <MapClickHandler onMapClick={handleMapClick} />
                    {optimizedStops.map((stop) => (
                      <Marker
                        key={stop.id}
                        position={[stop.lat, stop.lng]}
                        icon={defaultIcon}
                        eventHandlers={{
                          click: () => {
                            setSelectedStopId(stop.id)
                          },
                        }}
                      >
                        <Popup>
                          <div className="text-sm">
                            <div className="font-semibold">Stop #{stop.sequence}</div>
                            {stop.accountName && <div>{stop.accountName}</div>}
                            {stop.address && <div className="text-muted-foreground">{stop.address}</div>}
                          </div>
                        </Popup>
                      </Marker>
                    ))}
                    {roadRoutePositions.length > 1 && (
                      <Polyline
                        positions={roadRoutePositions.map((p) => [p[0], p[1]])}
                        color="#ef4444"
                        weight={4}
                        opacity={0.8}
                      />
                    )}
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
                    {optimizedStops.length > 0 && (
                      <MapBoundsFitter positions={optimizedStops.map((s) => [s.lat, s.lng])} />
                    )}
                  </MapContainer>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <Spinner className="h-8 w-8" />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Route className="h-5 w-5" />
                Route Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Total Distance</span>
                  <span className="font-semibold">{totalDistance.toFixed(2)} km</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Estimated Duration</span>
                  <span className="font-semibold">
                    {estimatedDuration.hours > 0 && `${estimatedDuration.hours}h `}
                    {estimatedDuration.minutes}m
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Stops</span>
                  <Badge variant="secondary">{optimizedStops.length}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Route Status</span>
                  <Badge variant="outline">Planned</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Delivery Stops
              </CardTitle>
            </CardHeader>
            <CardContent>
              {optimizedStops.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MapPin className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No stops added yet</p>
                  <p className="text-sm mt-2">Click on the map to add stops</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {optimizedStops.map((stop) => (
                    <div
                      key={stop.id}
                      className={cn(
                        'p-3 rounded-lg border cursor-pointer transition-colors',
                        selectedStopId === stop.id ? 'bg-primary/10 border-primary' : 'hover:bg-muted'
                      )}
                      onClick={() => setSelectedStopId(stop.id)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline">Stop #{stop.sequence}</Badge>
                          </div>
                          {stop.address ? (
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{stop.address}</p>
                          ) : (
                            <p className="text-xs text-muted-foreground mt-1 italic">
                              Loading address...
                            </p>
                          )}
                          {stop.accountName ? (
                            <div className="flex items-center gap-1 mt-2">
                              <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
                              <p className="font-medium text-xs text-foreground truncate">{stop.accountName}</p>
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground mt-2 italic">No customer linked</p>
                          )}
                          {stop.contactName && (
                            <div className="flex items-center gap-1 mt-1 flex-wrap">
                              <User className="h-3 w-3 text-muted-foreground shrink-0" />
                              <p className="text-xs text-muted-foreground">{stop.contactName}</p>
                              {stop.contactPhone && (
                                <>
                                  <Phone className="h-3 w-3 text-muted-foreground shrink-0" />
                                  <p className="text-xs text-muted-foreground">{stop.contactPhone}</p>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 ml-2"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleRemoveStop(stop.id)
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
            <Card className="h-fit w-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarIcon className="h-5 w-5" />
                  Route Information
                </CardTitle>
                <CardDescription>Basic route details and scheduling</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="route-name">
                      Route Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="route-name"
                      placeholder="e.g., Morning Delivery Route"
                      value={routeName}
                      onChange={(e) => setRouteName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="route-date">
                      Route Date <span className="text-destructive">*</span>
                    </Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start text-left font-normal">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {routeDate ? format(routeDate, 'PPP') : 'Pick a date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={routeDate}
                          onSelect={(date) => {
                            if (date) {
                              setRouteDate(date)
                            }
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="planned-start-time">
                      Start Time <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="planned-start-time"
                      type="time"
                      value={plannedStartTime}
                      onChange={(e) => setPlannedStartTime(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="planned-end-time">
                      End Time <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="planned-end-time"
                      type="time"
                      value={plannedEndTime}
                      onChange={(e) => setPlannedEndTime(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="route-group-id">Route Group ID</Label>
                    <Input
                      id="route-group-id"
                      placeholder="Auto-generated if empty"
                      value={routeGroupId}
                      onChange={(e) => setRouteGroupId(e.target.value)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="h-fit w-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Truck className="h-5 w-5" />
                  Vehicle & Driver
                </CardTitle>
                <CardDescription>Assign vehicle and driver to this route</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="vehicle">
                      Vehicle <span className="text-destructive">*</span>
                    </Label>
                  <Select value={vehicleId || undefined} onValueChange={setVehicleId} disabled={loadingVehicles}>
                    <SelectTrigger id="vehicle">
                      <SelectValue placeholder={loadingVehicles ? 'Loading...' : 'Select vehicle'} />
                    </SelectTrigger>
                    <SelectContent>
                      {vehicles.filter(v => v.ps_vehicledatabaseid).map((vehicle) => (
                        <SelectItem key={vehicle.ps_vehicledatabaseid} value={vehicle.ps_vehicledatabaseid!}>
                          {vehicle.ps_nickname || vehicle.ps_plate || 'Unknown'} - {vehicle.ps_make} {vehicle.ps_model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedVehicle && (
                    <div className="text-sm text-muted-foreground space-y-1 mt-2 p-3 bg-muted rounded-md">
                      <div><strong>Plate:</strong> {selectedVehicle.ps_plate || 'N/A'}</div>
                      <div><strong>Model:</strong> {selectedVehicle.ps_make} {selectedVehicle.ps_model}</div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="driver">
                    Driver <span className="text-destructive">*</span>
                  </Label>
                  <Select value={driverId || undefined} onValueChange={setDriverId} disabled={loadingDrivers}>
                    <SelectTrigger id="driver">
                      <SelectValue placeholder={loadingDrivers ? 'Loading...' : 'Select driver'} />
                    </SelectTrigger>
                    <SelectContent>
                      {drivers.filter(d => d.ps_staffid).map((driver) => (
                        <SelectItem key={driver.ps_staffid} value={driver.ps_staffid!}>
                          {getDriverDisplayName(driver)}
                          {driver.ps_staffnumber && ` (${driver.ps_staffnumber})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedDriver && (
                    <div className="text-sm text-muted-foreground space-y-1 mt-2 p-3 bg-muted rounded-md">
                      <div><strong>Name:</strong> {getDriverDisplayName(selectedDriver)}</div>
                      {selectedDriver.ps_staffnumber && <div><strong>Employee ID:</strong> {selectedDriver.ps_staffnumber}</div>}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="territory-group">Territory Group (Optional)</Label>
                  <Select value={territoryGroupId || '__none__'} onValueChange={(value) => setTerritoryGroupId(value === '__none__' ? '' : value)} disabled={loadingTerritoryGroups}>
                    <SelectTrigger id="territory-group">
                      <SelectValue placeholder={loadingTerritoryGroups ? 'Loading...' : 'Select territory group'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {territoryGroups.filter(t => t.ps_territorygroupid).map((territory) => (
                        <SelectItem key={territory.ps_territorygroupid} value={territory.ps_territorygroupid!}>
                          {territory.ps_name || 'Unknown'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                </div>
              </CardContent>
            </Card>

            {selectedStop ? (
              <Card className="h-fit w-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    Edit Stop #{selectedStop.sequence}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="stop-account">Account / Customer</Label>
                    <Select
                      value={selectedStop.accountId || '__none__'}
                      onValueChange={(value) => {
                        if (value === '__none__') {
                          handleUpdateStop(selectedStop.id, {
                            accountId: undefined,
                            accountName: undefined,
                          })
                        } else {
                          const account = accounts.find((a) => a.accountid === value)
                          handleUpdateStop(selectedStop.id, {
                            accountId: value,
                            accountName: account?.name || undefined,
                          })
                        }
                      }}
                      disabled={loadingAccounts}
                    >
                      <SelectTrigger id="stop-account">
                        <SelectValue placeholder={loadingAccounts ? 'Loading...' : 'Select account'} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">None</SelectItem>
                        {accounts.filter(a => a.accountid).map((account) => (
                          <SelectItem key={account.accountid} value={account.accountid!}>
                            {account.name || 'Unknown'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="stop-contact-name">Contact Name</Label>
                    <Input
                      id="stop-contact-name"
                      placeholder="Contact person name"
                      value={selectedStop.contactName || ''}
                      onChange={(e) => handleUpdateStop(selectedStop.id, { contactName: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="stop-contact-phone">Contact Phone</Label>
                    <Input
                      id="stop-contact-phone"
                      placeholder="Contact phone number"
                      value={selectedStop.contactPhone || ''}
                      onChange={(e) => handleUpdateStop(selectedStop.id, { contactPhone: e.target.value })}
                    />
                  </div>

                    <div className="space-y-2">
                      <Label htmlFor="stop-address">Address</Label>
                      <Textarea
                        id="stop-address"
                        placeholder="Delivery address"
                        value={selectedStop.address || ''}
                        onChange={(e) => handleUpdateStop(selectedStop.id, { address: e.target.value })}
                        rows={3}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="h-fit w-full opacity-50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    Edit Stop
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8 text-muted-foreground">
                    <p className="text-sm">Click on a stop marker on the map to edit</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
    </div>
  )
}

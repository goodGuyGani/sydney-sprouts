import { useState, useCallback, useMemo, useEffect } from 'react'
import { MapContainer, Marker, Popup, Polyline, useMapEvents, useMap, CircleMarker } from 'react-leaflet'
import { Icon } from 'leaflet'
import { GeoSearchControl, OpenStreetMapProvider } from 'leaflet-geosearch'
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

function formatLookupField(entitySetName: string, guid: string): string {
  return `/${entitySetName}(${guid})`
}
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { toast } from 'sonner'
import {
  Trash2,
  Save,
  RotateCcw,
  Navigation,
  Car,
  Check,
  ChevronsUpDown,
  User,
  Building2,
  MapPin,
  Calendar as CalendarIcon,
  Tag,
} from 'lucide-react'
import { getRouteForAllStops } from '@/lib/routeUtils'
import { cn } from '@/lib/utils'
import { MapTileLayer, type MapStyle, mapStyles } from '@/components/MapStyleSelector'
import { MapStyleControl } from '@/components/MapStyleControl'
import { MapBoundsFitter } from '@/components/MapBoundsFitter'
import 'leaflet/dist/leaflet.css'
import 'leaflet-geosearch/assets/css/leaflet.css'

interface Coordinate {
  id: string
  lat: number
  lng: number
  sequence?: number
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

function optimizeRouteSequence(coordinates: Coordinate[]): Coordinate[] {
  if (coordinates.length <= 1) return coordinates

  const unvisited = [...coordinates]
  const optimized: Coordinate[] = []
  
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

interface RouteMapCreatorProps {
  onSaveSuccess?: () => void
}

function MapCenter({ center }: { center: [number, number] }) {
  const map = useMap()
  useEffect(() => {
    map.setView(center, map.getZoom())
  }, [center, map])
  return null
}

interface GeoSearchResult {
  label: string
  x: number
  y: number
  lat?: number
  lng?: number
}

interface GeoSearchEvent {
  location?: GeoSearchResult
  label?: string
  x?: number
  y?: number
  lat?: number
  lng?: number
}

function GeoSearch({ onLocationSelect }: { onLocationSelect: (lat: number, lng: number, label: string) => void }) {
  const map = useMap()

  useEffect(() => {
    const provider = new OpenStreetMapProvider({
      params: {
        email: 'deliverysystem@example.com',
        'accept-language': 'en',
      },
    })

    type GeoSearchControlType = new (options: {
      provider: OpenStreetMapProvider
      style: string
      autoComplete: boolean
      autoCompleteDelay: number
      showMarker: boolean
      showPopup: boolean
      marker: { icon: Icon; draggable: boolean }
      popupFormat: (options: { result: GeoSearchResult }) => string
      maxMarkers: number
      retainZoomLevel: boolean
      animateZoom: boolean
      keepResult: boolean
      searchLabel: string
    }) => {
      addTo: (map: ReturnType<typeof useMap>) => void
    }

    const SearchControl = GeoSearchControl as unknown as GeoSearchControlType
    const searchControl = new SearchControl({
      provider,
      style: 'bar',
      autoComplete: true,
      autoCompleteDelay: 250,
      showMarker: true,
      showPopup: false,
      marker: {
        icon: defaultIcon,
        draggable: false,
      },
      popupFormat: ({ result }: { result: GeoSearchResult }) => result.label,
      maxMarkers: 1,
      retainZoomLevel: false,
      animateZoom: true,
      keepResult: false,
      searchLabel: 'Search for places, landmarks, or addresses...',
    })

    map.addControl(searchControl as Parameters<typeof map.addControl>[0])

    const handleLocationFound = (e: unknown) => {
      const event = e as GeoSearchEvent & { location?: GeoSearchResult }
      const result = event.location || event
      const latValue = result.y ?? result.lat
      const lngValue = result.x ?? result.lng
      const labelValue = result.label || event.label || 'Selected location'
      
      if (typeof latValue === 'number' && typeof lngValue === 'number' && typeof labelValue === 'string') {
        onLocationSelect(latValue, lngValue, labelValue)
      }
    }
    map.on('geosearch/showlocation', handleLocationFound as never)

    return () => {
      map.off('geosearch/showlocation', handleLocationFound as never)
      map.removeControl(searchControl as Parameters<typeof map.removeControl>[0])
    }
  }, [map, onLocationSelect])

  return null
}

export function RouteMapCreator({ onSaveSuccess }: RouteMapCreatorProps) {
  const { getAccessToken } = useDataverseToken()
  const [coordinates, setCoordinates] = useState<Coordinate[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [isLocating, setIsLocating] = useState(false)
  
  const [vehicleId, setVehicleId] = useState<string>('')
  const [driverId, setDriverId] = useState<string>('')
  const [accountId, setAccountId] = useState<string>('')
  const [territoryGroupId, setTerritoryGroupId] = useState<string>('')
  const [routeDate, setRouteDate] = useState<Date>(new Date())
  const [routeName, setRouteName] = useState<string>('')
  const [routeGroupId, setRouteGroupId] = useState<string>('')
  
  const [vehicles, setVehicles] = useState<PsVehicledatabase[]>([])
  const [drivers, setDrivers] = useState<PsStaff[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [territoryGroups, setTerritoryGroups] = useState<PsTerritorygroup[]>([])
  
  const [loadingVehicles, setLoadingVehicles] = useState(false)
  const [loadingDrivers, setLoadingDrivers] = useState(false)
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [loadingTerritoryGroups, setLoadingTerritoryGroups] = useState(false)
  
  const [mapStyle, setMapStyle] = useState<MapStyle>('osm')
  const [vehiclePopoverOpen, setVehiclePopoverOpen] = useState(false)
  const [driverPopoverOpen, setDriverPopoverOpen] = useState(false)
  const [accountPopoverOpen, setAccountPopoverOpen] = useState(false)
  const [territoryPopoverOpen, setTerritoryPopoverOpen] = useState(false)
  const [datePopoverOpen, setDatePopoverOpen] = useState(false)

  const optimizedCoordinates = useMemo(() => {
    return optimizeRouteSequence(coordinates)
  }, [coordinates])

  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null)
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null)

  const handleMapClick = useCallback((lat: number, lng: number) => {
    const newCoordinate: Coordinate = {
      id: `coord-${Date.now()}-${Math.random()}`,
      lat,
      lng,
    }
    setCoordinates((prev) => [...prev, newCoordinate])
    toast.success('Coordinate added', {
      description: `Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}`,
    })
  }, [])

  const handleLocationSelect = useCallback((lat: number, lng: number, label: string) => {
    const newCoordinate: Coordinate = {
      id: `coord-${Date.now()}-${Math.random()}`,
      lat,
      lng,
    }
    setCoordinates((prev) => [...prev, newCoordinate])
    setMapCenter([lat, lng])
    toast.success('Location added', {
      description: label,
    })
  }, [])

  const handleRemoveCoordinate = useCallback((id: string) => {
    setCoordinates((prev) => prev.filter((coord) => coord.id !== id))
    toast.info('Coordinate removed')
  }, [])

  useEffect(() => {
    const fetchVehicles = async () => {
      setLoadingVehicles(true)
      try {
        const token = await getAccessToken()
        if (!token) return

        const vehicleData = await dataverseApi.queryTable<PsVehicledatabase>(
          token,
          psvehicledatabaseEntitySet,
          '$select=ps_nickname,ps_plate,ps_make,ps_model,ps_vehicledatabaseid&$orderby=ps_nickname asc,ps_plate asc'
        )
        setVehicles(vehicleData)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to load vehicles'
        toast.error('Failed to load vehicles', {
          description: errorMessage,
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
          '$select=ps_staffid,ps_name,ps_firstname,ps_lastname&$orderby=ps_name asc'
        )
        setDrivers(driverData)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to load drivers'
        toast.error('Failed to load drivers', {
          description: errorMessage,
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
        const errorMessage = error instanceof Error ? error.message : 'Failed to load accounts'
        toast.error('Failed to load accounts', {
          description: errorMessage,
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
        const errorMessage = error instanceof Error ? error.message : 'Failed to load territory groups'
        toast.error('Failed to load territory groups', {
          description: errorMessage,
        })
      } finally {
        setLoadingTerritoryGroups(false)
      }
    }

    void fetchTerritoryGroups()
  }, [getAccessToken])

  const handleClearAll = useCallback(() => {
    setCoordinates([])
    setVehicleId('')
    setDriverId('')
    setAccountId('')
    setTerritoryGroupId('')
    setRouteDate(new Date())
    setRouteName('')
    setRouteGroupId('')
    setMapCenter(null)
    toast.info('All data cleared')
  }, [])

  const handleSave = useCallback(async () => {
    if (optimizedCoordinates.length === 0) {
      toast.error('No coordinates to save', {
        description: 'Add at least one coordinate on the map',
      })
      return
    }

    if (!vehicleId) {
      toast.error('Vehicle required', {
        description: 'Please select a vehicle for this route',
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
      const finalRouteName = routeName || `Route ${format(routeDate, 'yyyy-MM-dd')}`
      const routeDateStr = format(routeDate, 'yyyy-MM-dd')

      const routesToCreate = optimizedCoordinates.map((coord) => {
        const routeData: Record<string, unknown> = {
          ps_sequence: coord.sequence ?? 0,
          ps_sitelat: coord.lat,
          ps_sitelong: coord.lng,
          ps_route_date: routeDateStr,
          ps_routename: finalRouteName,
          ps_routegroupid: finalRouteGroupId,
          statecode: 0,
        }

        if (vehicleId) {
          routeData['ps_vehicle_route@odata.bind'] = formatLookupField(psvehicledatabaseEntitySet, vehicleId)
        }

        if (driverId) {
          routeData['ps_driver@odata.bind'] = formatLookupField(psstaffEntitySet, driverId)
        }

        if (accountId) {
          routeData['ps_account@odata.bind'] = formatLookupField(accountEntitySet, accountId)
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

      toast.success('Routes saved successfully', {
        description: `Created ${routesToCreate.length} route${routesToCreate.length !== 1 ? 's' : ''} with all assigned details`,
      })

      handleClearAll()
      onSaveSuccess?.()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save routes'
      toast.error('Failed to save routes', {
        description: errorMessage,
      })
    } finally {
      setIsSaving(false)
    }
  }, [
    optimizedCoordinates,
    vehicleId,
    driverId,
    accountId,
    territoryGroupId,
    routeDate,
    routeName,
    routeGroupId,
    vehicles,
    getAccessToken,
    handleClearAll,
    onSaveSuccess,
  ])

  const center: [number, number] = optimizedCoordinates.length > 0
    ? [optimizedCoordinates[0].lat, optimizedCoordinates[0].lng]
    : [14.5995, 120.9842]
  
  const [roadRoutePositions, setRoadRoutePositions] = useState<[number, number][]>([])
  const [loadingRoute, setLoadingRoute] = useState(false)

  useEffect(() => {
    if (optimizedCoordinates.length < 2) {
      setRoadRoutePositions([])
      setLoadingRoute(false)
      return
    }

    const routeLinePositions = optimizedCoordinates.map((coord) => [coord.lat, coord.lng] as [number, number])
    
    setLoadingRoute(true)
    getRouteForAllStops(routeLinePositions)
      .then((positions) => {
        setRoadRoutePositions(positions)
        setLoadingRoute(false)
      })
      .catch(() => {
        setRoadRoutePositions(routeLinePositions)
        setLoadingRoute(false)
      })
  }, [optimizedCoordinates])

  const getDisplayName = (item: { ps_name?: string | null; ps_firstname?: string | null; ps_lastname?: string | null; name?: string | null }) => {
    if ('name' in item) {
      return item.name || 'Unnamed'
    }
    if ('ps_firstname' in item || 'ps_lastname' in item) {
      return `${item.ps_firstname || ''} ${item.ps_lastname || ''}`.trim() || item.ps_name || 'Unnamed'
    }
    return item.ps_name || 'Unnamed'
  }

  return (
    <div className="">
      <div className="bg-linear-to-b from-cyan-500/20 via-blue-500/15 to-cyan-600/20 border-r border-cyan-400/30 border-b p-4 rounded-lg">
        <h2 className="text-2xl text-cyan-800 font-bold">
          Route Map Creator
        </h2>
        <p className="text-muted-foreground font-normal mt-2">
          Click on the map to add delivery coordinates. Assign driver, vehicle, customer, and other details. Products and purchase orders can be linked through sales orders after route creation.
        </p>
      </div>
      <div className="space-y-6 p-6 border-2 border-cyan-400 rounded-lg my-5">
        <Card className="border-2">
          <CardHeader>
            <CardTitle className="text-lg">Route Information</CardTitle>
            <CardDescription>Assign essential details for this delivery route</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="route-date" className="flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4" />
                  Route Date <span className="text-destructive">*</span>
                </Label>
                <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      id="route-date"
                      variant="outline"
                      className="w-full justify-start text-left font-normal border-2"
                    >
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
                          setDatePopoverOpen(false)
                        }
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label htmlFor="route-name" className="flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  Route Name
                </Label>
                <Input
                  id="route-name"
                  placeholder="e.g., Morning Delivery Route"
                  value={routeName}
                  onChange={(e) => setRouteName(e.target.value)}
                  className="border-2"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="route-group-id" className="flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  Route Group ID
                </Label>
                <Input
                  id="route-group-id"
                  placeholder="Auto-generated if empty"
                  value={routeGroupId}
                  onChange={(e) => setRouteGroupId(e.target.value)}
                  className="border-2"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-2">
          <CardHeader>
            <CardTitle className="text-lg">Assignments</CardTitle>
            <CardDescription>Assign driver, vehicle, customer, and territory</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="vehicle-select" className="flex items-center gap-2">
                  <Car className="h-4 w-4 text-primary" />
                  Vehicle <span className="text-destructive">*</span>
                </Label>
                {loadingVehicles ? (
                  <div className="flex items-center gap-2 h-10 px-3 rounded-lg border bg-muted/50">
                    <Spinner className="size-4 text-primary" />
                    <span className="text-sm text-muted-foreground">Loading vehicles...</span>
                  </div>
                ) : (
                  <Popover open={vehiclePopoverOpen} onOpenChange={setVehiclePopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        id="vehicle-select"
                        variant="outline"
                        role="combobox"
                        className="w-full h-10 justify-between border-2 hover:border-primary/50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <Car className="size-4 text-primary" />
                          {vehicleId
                            ? (() => {
                                const selectedVehicle = vehicles.find((v) => v.ps_vehicledatabaseid === vehicleId)
                                if (!selectedVehicle) return 'Select a vehicle'
                                const nickname = selectedVehicle.ps_nickname
                                const makeModel = selectedVehicle.ps_make && selectedVehicle.ps_model 
                                  ? `${selectedVehicle.ps_make} ${selectedVehicle.ps_model}` 
                                  : null
                                const plate = selectedVehicle.ps_plate
                                const displayName = nickname || makeModel || plate || 'Unnamed Vehicle'
                                const parts: string[] = [displayName]
                                if (plate && plate !== displayName) {
                                  parts.push(`(${plate})`)
                                }
                                if (makeModel && nickname && makeModel !== nickname) {
                                  parts.push(`- ${makeModel}`)
                                }
                                return parts.join(' ')
                              })()
                            : 'Select a vehicle'}
                        </div>
                        <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0 z-1001" align="start">
                      <Command>
                        <CommandInput placeholder="Search vehicles..." className="h-9" />
                        <CommandList>
                          <CommandEmpty>No vehicles found.</CommandEmpty>
                          <CommandGroup>
                            {vehicles.length === 0 ? (
                              <CommandItem disabled>No vehicles available</CommandItem>
                            ) : (
                              vehicles.map((vehicle) => {
                                const vId = vehicle.ps_vehicledatabaseid || ''
                                const nickname = vehicle.ps_nickname
                                const makeModel = vehicle.ps_make && vehicle.ps_model 
                                  ? `${vehicle.ps_make} ${vehicle.ps_model}` 
                                  : null
                                const plate = vehicle.ps_plate
                                const displayName = nickname || makeModel || plate || 'Unnamed Vehicle'
                                const parts: string[] = [displayName]
                                if (plate && plate !== displayName) {
                                  parts.push(`(${plate})`)
                                }
                                if (makeModel && nickname && makeModel !== nickname) {
                                  parts.push(`- ${makeModel}`)
                                }
                                const vehicleLabel = parts.join(' ')
                                return (
                                  <CommandItem
                                    key={vId}
                                    value={vehicleLabel}
                                    onSelect={() => {
                                      setVehicleId(vId)
                                      setVehiclePopoverOpen(false)
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 size-4",
                                        vehicleId === vId ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    {vehicleLabel}
                                  </CommandItem>
                                )
                              })
                            )}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="driver-select" className="flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" />
                  Driver (Person)
                </Label>
                {loadingDrivers ? (
                  <div className="flex items-center gap-2 h-10 px-3 rounded-lg border bg-muted/50">
                    <Spinner className="size-4 text-primary" />
                    <span className="text-sm text-muted-foreground">Loading drivers...</span>
                  </div>
                ) : (
                  <Popover open={driverPopoverOpen} onOpenChange={setDriverPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        id="driver-select"
                        variant="outline"
                        role="combobox"
                        className="w-full h-10 justify-between border-2 hover:border-primary/50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <User className="size-4 text-primary" />
                          {driverId
                            ? getDisplayName(drivers.find((d) => d.ps_staffid === driverId) || {})
                            : 'Select a driver'}
                        </div>
                        <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0 z-1001" align="start">
                      <Command>
                        <CommandInput placeholder="Search drivers..." className="h-9" />
                        <CommandList>
                          <CommandEmpty>No drivers found.</CommandEmpty>
                          <CommandGroup>
                            {drivers.length === 0 ? (
                              <CommandItem disabled>No drivers available</CommandItem>
                            ) : (
                              drivers.map((driver) => {
                                const dId = driver.ps_staffid || ''
                                const displayName = getDisplayName(driver)
                                return (
                                  <CommandItem
                                    key={dId}
                                    value={displayName}
                                    onSelect={() => {
                                      setDriverId(dId)
                                      setDriverPopoverOpen(false)
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 size-4",
                                        driverId === dId ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    {displayName}
                                  </CommandItem>
                                )
                              })
                            )}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="account-select" className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  Customer (Account)
                </Label>
                {loadingAccounts ? (
                  <div className="flex items-center gap-2 h-10 px-3 rounded-lg border bg-muted/50">
                    <Spinner className="size-4 text-primary" />
                    <span className="text-sm text-muted-foreground">Loading customers...</span>
                  </div>
                ) : (
                  <Popover open={accountPopoverOpen} onOpenChange={setAccountPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        id="account-select"
                        variant="outline"
                        role="combobox"
                        className="w-full h-10 justify-between border-2 hover:border-primary/50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <Building2 className="size-4 text-primary" />
                          {accountId
                            ? accounts.find((a) => a.accountid === accountId)?.name || 'Select a customer'
                            : 'Select a customer'}
                        </div>
                        <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0 z-1001" align="start">
                      <Command>
                        <CommandInput placeholder="Search customers..." className="h-9" />
                        <CommandList>
                          <CommandEmpty>No customers found.</CommandEmpty>
                          <CommandGroup>
                            {accounts.length === 0 ? (
                              <CommandItem disabled>No customers available</CommandItem>
                            ) : (
                              accounts.map((account) => {
                                const aId = account.accountid || ''
                                const displayName = account.name || 'Unnamed Customer'
                                return (
                                  <CommandItem
                                    key={aId}
                                    value={displayName}
                                    onSelect={() => {
                                      setAccountId(aId)
                                      setAccountPopoverOpen(false)
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 size-4",
                                        accountId === aId ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    {displayName}
                                  </CommandItem>
                                )
                              })
                            )}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="territory-select" className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  Territory Group
                </Label>
                {loadingTerritoryGroups ? (
                  <div className="flex items-center gap-2 h-10 px-3 rounded-lg border bg-muted/50">
                    <Spinner className="size-4 text-primary" />
                    <span className="text-sm text-muted-foreground">Loading territories...</span>
                  </div>
                ) : (
                  <Popover open={territoryPopoverOpen} onOpenChange={setTerritoryPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        id="territory-select"
                        variant="outline"
                        role="combobox"
                        className="w-full h-10 justify-between border-2 hover:border-primary/50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <MapPin className="size-4 text-primary" />
                          {territoryGroupId
                            ? territoryGroups.find((t) => t.ps_territorygroupid === territoryGroupId)?.ps_name || 'Select territory'
                            : 'Select territory'}
                        </div>
                        <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0 z-1001" align="start">
                      <Command>
                        <CommandInput placeholder="Search territories..." className="h-9" />
                        <CommandList>
                          <CommandEmpty>No territories found.</CommandEmpty>
                          <CommandGroup>
                            {territoryGroups.length === 0 ? (
                              <CommandItem disabled>No territories available</CommandItem>
                            ) : (
                              territoryGroups.map((territory) => {
                                const tId = territory.ps_territorygroupid || ''
                                const displayName = territory.ps_name || territory.ps_id || 'Unnamed Territory'
                                return (
                                  <CommandItem
                                    key={tId}
                                    value={displayName}
                                    onSelect={() => {
                                      setTerritoryGroupId(tId)
                                      setTerritoryPopoverOpen(false)
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 size-4",
                                        territoryGroupId === tId ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    {displayName}
                                  </CommandItem>
                                )
                              })
                            )}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col md:flex-row gap-4 items-start md:items-end">
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/20">
            <div className="flex items-center gap-2">
              <div className="size-2 rounded-full bg-primary animate-pulse"></div>
              <div className="text-sm font-semibold text-primary">
                {optimizedCoordinates.length} coordinate{optimizedCoordinates.length !== 1 ? 's' : ''} added
              </div>
            </div>
          </div>
          <div className="flex gap-2 ml-auto">
            <Button
              variant="outline"
              onClick={handleClearAll}
              disabled={coordinates.length === 0 || isSaving}
              className="border-2 hover:bg-destructive/10 hover:border-destructive/50 hover:text-destructive transition-all"
            >
              <RotateCcw className="mr-2 size-4" />
              Clear All
            </Button>
            <Button
              onClick={(e) => {
                e.preventDefault()
                void handleSave()
              }}
              disabled={optimizedCoordinates.length === 0 || !vehicleId || isSaving}
              type="button"
              className="bg-linear-to-b from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-black shadow-md hover:shadow-lg shadow-cyan-500/30 transition-all"
            >
              {isSaving ? (
                <>
                  <Spinner className="mr-2 size-4" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 size-4" />
                  Save {optimizedCoordinates.length} Route{optimizedCoordinates.length !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="rounded-xl border-2 border-primary/20 overflow-hidden relative shadow-lg from-muted/30 to-background" style={{ height: '600px' }}>
          <div className="absolute top-4 left-4 z-1000 flex flex-col gap-2">
            {loadingRoute && optimizedCoordinates.length > 1 && (
              <div className="from-primary/95 to-primary/90 backdrop-blur-md p-3 rounded-lg border border-primary/30 shadow-xl">
                <div className="flex items-center gap-2 text-sm text-primary-foreground font-medium">
                  <Spinner className="size-4" />
                  <span>Calculating road route...</span>
                </div>
              </div>
            )}
            <Button
              size="sm"
              variant="secondary"
              className="shadow-md bg-background/80 backdrop-blur border"
              disabled={isLocating}
              onClick={() => {
                if (!navigator.geolocation) {
                  toast.error('Location not supported', {
                    description: 'Your device does not allow GPS access.',
                  })
                  return
                }
                setIsLocating(true)
                navigator.geolocation.getCurrentPosition(
                  (position) => {
                    const { latitude, longitude } = position.coords
                    setUserLocation([latitude, longitude])
                    setMapCenter([latitude, longitude])
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
              }}
            >
              {isLocating ? (
                <>
                  <Spinner className="mr-2 size-4" />
                  Locating...
                </>
              ) : (
                <>
                  <Navigation className="mr-2 size-4" />
                  Use my location
                </>
              )}
            </Button>
          </div>
          <div className="absolute top-4 right-4 z-1000">
            <MapStyleControl
              value={mapStyle}
              onValueChange={(style) => {
                setMapStyle(style)
                toast.success('Map style changed', {
                  description: `Switched to ${mapStyles.find((s) => s.value === style)?.label || style}`,
                })
              }}
            />
          </div>
          <MapContainer
            center={mapCenter || center}
            zoom={mapCenter ? 15 : 13}
            style={{ height: '100%', width: '100%' }}
          >
            <MapTileLayer style={mapStyle} />
            {mapCenter && <MapCenter center={mapCenter} />}
            {optimizedCoordinates.length > 0 && (
              <MapBoundsFitter
                positions={optimizedCoordinates.map((coord) => [coord.lat, coord.lng] as [number, number])}
                padding={[50, 50]}
              />
            )}
            <MapClickHandler onMapClick={handleMapClick} />
            <GeoSearch onLocationSelect={handleLocationSelect} />
            
            {roadRoutePositions.length > 1 && (
              <Polyline
                positions={roadRoutePositions}
                pathOptions={{ 
                  color: '#3b82f6', 
                  weight: 5,
                  opacity: 0.8,
                  dashArray: '10, 5'
                }}
              />
            )}

            {optimizedCoordinates.map((coord) => (
              <Marker
                key={coord.id}
                position={[coord.lat, coord.lng]}
                icon={defaultIcon}
              >
                <Popup>
                  <div className="space-y-3 p-1">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center justify-center w-6 h-6 rounded-full from-primary to-primary/70 text-primary-foreground font-bold text-xs">
                        {coord.sequence}
                      </div>
                      <div className="font-semibold text-base">
                        Stop #{coord.sequence}
                      </div>
                    </div>
                    <div className="text-sm space-y-1 bg-muted/50 p-2 rounded-md">
                      <div className="font-mono text-xs">
                        <span className="text-muted-foreground">Lat:</span> {coord.lat.toFixed(6)}
                      </div>
                      <div className="font-mono text-xs">
                        <span className="text-muted-foreground">Lng:</span> {coord.lng.toFixed(6)}
                      </div>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        e.preventDefault()
                        handleRemoveCoordinate(coord.id)
                      }}
                      className="w-full mt-2 hover:bg-destructive/90 transition-all"
                    >
                      <Trash2 className="mr-2 size-3" />
                      Remove
                    </Button>
                  </div>
                </Popup>
              </Marker>
            ))}
            {userLocation && (
              <CircleMarker
                center={userLocation}
                radius={10}
                pathOptions={{ color: '#0ea5e9', fillColor: '#0ea5e9', fillOpacity: 0.4, weight: 2 }}
              >
                <Popup>
                  <div className="space-y-2">
                    <div className="font-semibold text-base">Your location</div>
                    <div className="text-xs font-mono text-muted-foreground">
                      {userLocation[0].toFixed(6)}, {userLocation[1].toFixed(6)}
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            )}
          </MapContainer>
        </div>

        {optimizedCoordinates.length > 0 && (
          <Card className="border-2 border-primary/20 from-primary/5 via-background to-primary/5 shadow-md">
            <CardHeader className="from-primary/10 to-transparent border-b border-primary/20">
              <CardTitle className="text-lg flex items-center gap-2 text-primary">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg from-primary to-primary/70 text-primary-foreground">
                  <Navigation className="size-4" />
                </div>
                Optimized Route Sequence
              </CardTitle>
              <CardDescription className="text-sm mt-1">
                The route has been optimized for the fastest path. Coordinates are shown in delivery order.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-3">
                {optimizedCoordinates.map((coord, index) => {
                  const distance = index < optimizedCoordinates.length - 1
                    ? calculateDistance(
                        coord.lat,
                        coord.lng,
                        optimizedCoordinates[index + 1].lat,
                        optimizedCoordinates[index + 1].lng
                      )
                    : null
                  
                  return (
                    <div key={coord.id}>
                      <div className="flex items-center justify-between p-4 rounded-lg border-2 border-primary/10 from-background to-primary/5 hover:border-primary/30 hover:shadow-md transition-all">
                        <div className="flex items-center gap-4">
                          <div className="flex items-center justify-center w-10 h-10 rounded-full from-primary via-primary/90 to-primary/70 text-primary-foreground font-bold text-base shadow-md">
                            {coord.sequence}
                          </div>
                          <div>
                            <div className="font-semibold text-base">Stop {coord.sequence}</div>
                            <div className="text-xs text-muted-foreground font-mono mt-0.5">
                              {coord.lat.toFixed(6)}, {coord.lng.toFixed(6)}
                            </div>
                          </div>
                        </div>
                        {distance !== null && (
                          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20">
                            <div className="text-primary font-semibold text-sm">
                              ↓ {distance.toFixed(2)} km
                            </div>
                          </div>
                        )}
                      </div>
                      {index < optimizedCoordinates.length - 1 && (
                        <div className="flex justify-center py-1">
                          <div className="w-0.5 h-4 from-primary/50 to-primary/30"></div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

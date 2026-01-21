import { useMemo, useState, useEffect, useCallback } from 'react'
import { MapContainer, Marker, Popup, Polyline, useMap, CircleMarker } from 'react-leaflet'
import { Icon } from 'leaflet'
import { type PsDeliveryroutes } from '@/types/dataverse'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { ArrowLeft, MapPin, Calendar, Car, Navigation, ArrowDown, Loader2 } from 'lucide-react'
import { getRouteForAllStops } from '@/lib/routeUtils'
import { reverseGeocode } from '@/lib/geocoding'
import { MapTileLayer, type MapStyle, mapStyles } from '@/components/MapStyleSelector'
import { MapStyleControl } from '@/components/MapStyleControl'
import { MapBoundsFitter } from '@/components/MapBoundsFitter'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import 'leaflet/dist/leaflet.css'

interface RouteDetailViewProps {
  routes: PsDeliveryroutes[]
  onBack: () => void
}

interface RouteWithAddress extends PsDeliveryroutes {
  address?: string
  loadingAddress?: boolean
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

function MapMarkerHighlighter({ position }: { position: [number, number] | null }) {
  const map = useMap()
  
  useEffect(() => {
    if (position) {
      map.setView(position, 15, {
        animate: true,
        duration: 0.5,
      })
    }
  }, [map, position])
  
  return null
}

function MapCenterer({ center }: { center: [number, number] }) {
  const map = useMap()

  useEffect(() => {
    map.setView(center, map.getZoom())
  }, [center, map])

  return null
}

export function RouteDetailView({ routes, onBack }: RouteDetailViewProps) {
  const [mapStyle, setMapStyle] = useState<MapStyle>('osm')
  const [routesWithAddresses, setRoutesWithAddresses] = useState<RouteWithAddress[]>([])
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)
  const [loadingAddresses, setLoadingAddresses] = useState(false)
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null)
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null)
  const [isLocating, setIsLocating] = useState(false)
  
  const sortedRoutes = useMemo(() => {
    return [...routes].sort((a, b) => {
      const seqA = a.ps_sequence ?? 0
      const seqB = b.ps_sequence ?? 0
      return seqA - seqB
    })
  }, [routes])

  const routePositions = useMemo(() => {
    return sortedRoutes
      .filter((route) => route.ps_sitelat != null && route.ps_sitelong != null)
      .map((route) => [route.ps_sitelat!, route.ps_sitelong!] as [number, number])
  }, [sortedRoutes])

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
    const fetchAddresses = async () => {
      setLoadingAddresses(true)
      const routesWithAddr: RouteWithAddress[] = await Promise.all(
        sortedRoutes.map(async (route) => {
          if (route.ps_sitelat == null || route.ps_sitelong == null) {
            return { ...route, address: undefined, loadingAddress: false }
          }
          
          try {
            const address = await reverseGeocode(route.ps_sitelat, route.ps_sitelong)
            return { ...route, address: address || undefined, loadingAddress: false }
          } catch {
            return { ...route, address: undefined, loadingAddress: false }
          }
        })
      )
      setRoutesWithAddresses(routesWithAddr)
      setLoadingAddresses(false)
    }

    if (sortedRoutes.length > 0) {
      void fetchAddresses()
    }
  }, [sortedRoutes])

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

  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return '-'
    try {
      return new Date(dateString).toLocaleString()
    } catch {
      return dateString
    }
  }

  const firstRoute = sortedRoutes[0]
  const vehicleName = firstRoute?.ps_vehiclename || 'Not specified'
  const createdOn = firstRoute?.createdon
  const status = firstRoute?.statecode === 0 ? 'Active' : 'Inactive'

  const selectedRoute = routesWithAddresses.find((r) => r.ps_deliveryroutesid === selectedRouteId)
  const selectedPosition: [number, number] | null = selectedRoute && selectedRoute.ps_sitelat != null && selectedRoute.ps_sitelong != null
    ? [selectedRoute.ps_sitelat, selectedRoute.ps_sitelong]
    : null

  const handleRouteCardClick = useCallback((route: RouteWithAddress) => {
    setSelectedRouteId(route.ps_deliveryroutesid || null)
  }, [])

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

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="outline" size="sm" onClick={onBack}>
                <ArrowLeft className="mr-2 size-4" />
                Back to Routes
              </Button>
              <div>
                <CardTitle>Route Details</CardTitle>
                <CardDescription>
                  {sortedRoutes.length} stop{sortedRoutes.length !== 1 ? 's' : ''} • Total distance: {totalDistance.toFixed(2)} km
                </CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/50">
              <Car className="size-5 text-muted-foreground" />
              <div>
                <div className="text-sm text-muted-foreground">Vehicle</div>
                <div className="font-medium">{vehicleName}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/50">
              <Calendar className="size-5 text-muted-foreground" />
              <div>
                <div className="text-sm text-muted-foreground">Created</div>
                <div className="font-medium">{formatDate(createdOn)}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/50">
              <MapPin className="size-5 text-muted-foreground" />
              <div>
                <div className="text-sm text-muted-foreground">Stops</div>
                <div className="font-medium">{sortedRoutes.length}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/50">
              <Navigation className="size-5 text-muted-foreground" />
              <div>
                <div className="text-sm text-muted-foreground">Status</div>
                <div className="font-medium">
                  <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                    status === 'Active'
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
                  }`}>
                    {status}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 rounded-lg border overflow-hidden relative" style={{ height: '600px' }}>
              <div className="absolute top-4 left-4 z-1000 flex flex-col gap-2">
                {loadingRoute && routePositions.length > 1 && (
                  <div className="bg-background/90 backdrop-blur p-2 rounded-md border shadow-md">
                    <div className="flex items-center gap-2 text-sm">
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
                {mapCenter && <MapCenterer center={mapCenter} />}
                {routePositions.length > 0 && (
                  <MapBoundsFitter
                    positions={[...routePositions, ...(userLocation ? [userLocation] : [])]}
                    padding={[50, 50]}
                  />
                )}
                {selectedPosition && <MapMarkerHighlighter position={selectedPosition} />}
                
                {roadRoutePositions.length > 1 && (
                  <Polyline
                    positions={roadRoutePositions}
                    pathOptions={{ color: '#ef4444', weight: 4 }}
                  />
                )}

                {sortedRoutes.map((route, index) => {
                  if (route.ps_sitelat == null || route.ps_sitelong == null) return null
                  return (
                    <Marker
                      key={route.ps_deliveryroutesid}
                      position={[route.ps_sitelat, route.ps_sitelong]}
                      icon={defaultIcon}
                    >
                      <Popup>
                        <div className="space-y-2">
                          <div className="font-semibold">
                            Stop #{route.ps_sequence ?? index + 1}
                          </div>
                          <div className="text-sm">
                            <div>Lat: {route.ps_sitelat.toFixed(6)}</div>
                            <div>Lng: {route.ps_sitelong.toFixed(6)}</div>
                          </div>
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

            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Navigation className="size-4" />
                  Route Sequence
                </CardTitle>
                <CardDescription>
                  Click a stop to view on map
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[600px]">
                  <div className="p-4 space-y-0">
                    {loadingAddresses ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="flex flex-col items-center gap-2">
                          <Spinner className="size-6" />
                          <p className="text-sm text-muted-foreground">Loading addresses...</p>
                        </div>
                      </div>
                    ) : (
                      routesWithAddresses.map((route, index) => {
                        if (route.ps_sitelat == null || route.ps_sitelong == null) return null
                        const nextRoute = routesWithAddresses[index + 1]
                        const distance = nextRoute?.ps_sitelat != null && nextRoute?.ps_sitelong != null
                          ? calculateDistance(
                              route.ps_sitelat,
                              route.ps_sitelong,
                              nextRoute.ps_sitelat,
                              nextRoute.ps_sitelong
                            )
                          : null
                        const isSelected = route.ps_deliveryroutesid === selectedRouteId

                        return (
                          <div key={route.ps_deliveryroutesid} className="relative">
                            <Card
                              className={`cursor-pointer transition-all hover:shadow-md ${
                                isSelected 
                                  ? 'border-primary shadow-md bg-primary/5' 
                                  : 'border-border hover:border-primary/50'
                              }`}
                              onClick={() => handleRouteCardClick(route)}
                            >
                              <CardContent className="p-4">
                                <div className="flex items-start gap-3">
                                  <div className={`flex items-center justify-center w-10 h-10 rounded-full font-semibold text-sm shrink-0 ${
                                    isSelected
                                      ? 'bg-primary text-primary-foreground'
                                      : 'bg-muted text-muted-foreground'
                                  }`}>
                                    {route.ps_sequence ?? index + 1}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-semibold text-sm mb-1">
                                      Stop {route.ps_sequence ?? index + 1}
                                    </div>
                                    {route.loadingAddress ? (
                                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <Loader2 className="size-3 animate-spin" />
                                        Loading address...
                                      </div>
                                    ) : route.address ? (
                                      <div className="text-sm text-muted-foreground line-clamp-2">
                                        {route.address}
                                      </div>
                                    ) : (
                                      <div className="text-xs text-muted-foreground font-mono">
                                        {route.ps_sitelat.toFixed(6)}, {route.ps_sitelong.toFixed(6)}
                                      </div>
                                    )}
                                    {distance !== null && (
                                      <div className="mt-2 text-xs text-muted-foreground">
                                        {distance.toFixed(2)} km to next stop
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                            {index < routesWithAddresses.length - 1 && (
                              <div className="flex justify-center py-2">
                                <ArrowDown className="size-5 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                        )
                      })
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

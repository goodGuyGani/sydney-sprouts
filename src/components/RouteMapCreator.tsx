import { useState, useCallback, useMemo, useEffect } from 'react'
import { MapContainer, Marker, Popup, Polyline, useMapEvents, useMap } from 'react-leaflet'
import { Icon } from 'leaflet'
import { GeoSearchControl, OpenStreetMapProvider } from 'leaflet-geosearch'
import { useDataverseToken } from '@/hooks/useDataverseToken'
import { dataverseApi } from '@/lib/dataverseApi'
import { type PsDeliveryroutes, psdeliveryroutesEntitySet, type PsVehicledatabase, psvehicledatabaseEntitySet } from '@/types/dataverse'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Trash2, Save, RotateCcw, Navigation, Car } from 'lucide-react'
import { getRouteForAllStops } from '@/lib/routeUtils'
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
  const [vehicleId, setVehicleId] = useState<string>('')
  const [vehicles, setVehicles] = useState<PsVehicledatabase[]>([])
  const [loadingVehicles, setLoadingVehicles] = useState(false)
  const [mapStyle, setMapStyle] = useState<MapStyle>('osm')

  const optimizedCoordinates = useMemo(() => {
    return optimizeRouteSequence(coordinates)
  }, [coordinates])

  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null)

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

  const handleClearAll = useCallback(() => {
    setCoordinates([])
    setVehicleId('')
    setMapCenter(null)
    toast.info('All coordinates cleared')
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

      const selectedVehicle = vehicles.find((v) => v.ps_vehicledatabaseid === vehicleId)
      const vehicleName = selectedVehicle?.ps_nickname || 
        (selectedVehicle?.ps_make && selectedVehicle?.ps_model 
          ? `${selectedVehicle.ps_make} ${selectedVehicle.ps_model}` 
          : '') || 
        selectedVehicle?.ps_plate || 
        'Unnamed Vehicle'

      const routesToCreate: Partial<PsDeliveryroutes>[] = optimizedCoordinates.map((coord) => ({
        ps_sequence: coord.sequence ?? 0,
        ps_sitelat: coord.lat,
        ps_sitelong: coord.lng,
        ps_vehiclename: vehicleName,
        statecode: 0,
      }))

      const createPromises = routesToCreate.map((route) =>
        dataverseApi.createRecord<PsDeliveryroutes>(token, psdeliveryroutesEntitySet, route)
      )

      await Promise.all(createPromises)

      toast.success('Routes saved successfully', {
        description: `Created ${routesToCreate.length} route${routesToCreate.length !== 1 ? 's' : ''}`,
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
  }, [optimizedCoordinates, vehicleId, vehicles, getAccessToken, handleClearAll, onSaveSuccess])

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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Route Map Creator</CardTitle>
            <CardDescription>
              Click on the map to add delivery coordinates. The system will automatically calculate the optimal route sequence.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleClearAll}
              disabled={coordinates.length === 0 || isSaving}
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
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-4">
          <div className="flex-1">
            <label htmlFor="vehicle-select" className="text-sm font-medium mb-2 block">
              Vehicle <span className="text-destructive">*</span>
            </label>
            {loadingVehicles ? (
              <div className="flex items-center gap-2 h-9">
                <Spinner className="size-4" />
                <span className="text-sm text-muted-foreground">Loading vehicles...</span>
              </div>
            ) : (
              <Select value={vehicleId} onValueChange={setVehicleId} required>
                <SelectTrigger id="vehicle-select" className="w-full">
                  <Car className="mr-2 size-4" />
                  <SelectValue placeholder="Select a vehicle" />
                </SelectTrigger>
                <SelectContent className="z-1001">
                  {vehicles.length === 0 ? (
                    <SelectItem value="no-vehicles" disabled>
                      No vehicles available
                    </SelectItem>
                  ) : (
                    vehicles.map((vehicle) => {
                      const vehicleId = vehicle.ps_vehicledatabaseid || ''
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
                      
                      return (
                        <SelectItem key={vehicleId} value={vehicleId}>
                          {parts.join(' ')}
                        </SelectItem>
                      )
                    })
                  )}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="flex items-end">
            <div className="text-sm text-muted-foreground">
              {optimizedCoordinates.length} coordinate{optimizedCoordinates.length !== 1 ? 's' : ''} added
            </div>
          </div>
        </div>

        <div className="rounded-lg border overflow-hidden relative" style={{ height: '600px' }}>
          {loadingRoute && optimizedCoordinates.length > 1 && (
            <div className="absolute top-4 left-4 z-1000 bg-background/90 backdrop-blur p-2 rounded-md border shadow-md">
              <div className="flex items-center gap-2 text-sm">
                <Spinner className="size-4" />
                <span>Calculating road route...</span>
              </div>
            </div>
          )}
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
                pathOptions={{ color: '#ef4444', weight: 4 }}
              />
            )}

            {optimizedCoordinates.map((coord) => (
              <Marker
                key={coord.id}
                position={[coord.lat, coord.lng]}
                icon={defaultIcon}
              >
                <Popup>
                  <div className="space-y-2">
                    <div className="font-semibold">
                      Stop #{coord.sequence}
                    </div>
                    <div className="text-sm">
                      <div>Lat: {coord.lat.toFixed(6)}</div>
                      <div>Lng: {coord.lng.toFixed(6)}</div>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        e.preventDefault()
                        handleRemoveCoordinate(coord.id)
                      }}
                      className="w-full mt-2"
                    >
                      <Trash2 className="mr-2 size-3" />
                      Remove
                    </Button>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>

        {optimizedCoordinates.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Navigation className="size-4" />
                Optimized Route Sequence
              </CardTitle>
              <CardDescription>
                The route has been optimized for the fastest path. Coordinates are shown in delivery order.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {optimizedCoordinates.map((coord, index) => (
                  <div
                    key={coord.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-semibold text-sm">
                        {coord.sequence}
                      </div>
                      <div>
                        <div className="font-medium">Stop {coord.sequence}</div>
                        <div className="text-sm text-muted-foreground font-mono">
                          {coord.lat.toFixed(6)}, {coord.lng.toFixed(6)}
                        </div>
                      </div>
                    </div>
                    {index < optimizedCoordinates.length - 1 && (
                      <div className="text-muted-foreground">
                        ↓ {calculateDistance(
                          coord.lat,
                          coord.lng,
                          optimizedCoordinates[index + 1].lat,
                          optimizedCoordinates[index + 1].lng
                        ).toFixed(2)} km
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  )
}

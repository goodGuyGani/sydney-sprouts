import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet-providers'

export type MapStyle = 'osm' | 'satellite' | 'terrain' | 'light' | 'dark'

export interface MapStyleOption {
  value: MapStyle
  label: string
  provider: string
  options?: Record<string, unknown>
}

export const mapStyles: MapStyleOption[] = [
  {
    value: 'osm',
    label: 'OpenStreetMap',
    provider: 'OpenStreetMap.Mapnik',
  },
  {
    value: 'satellite',
    label: 'Satellite',
    provider: 'Esri.WorldImagery',
  },
  {
    value: 'terrain',
    label: 'Terrain',
    provider: 'OpenTopoMap',
  },
  {
    value: 'light',
    label: 'Light Roads',
    provider: 'CartoDB.Positron',
  },
  {
    value: 'dark',
    label: 'Dark Roads',
    provider: 'CartoDB.DarkMatter',
  },
]

interface MapTileLayerProps {
  style: MapStyle
}

export function MapTileLayer({ style }: MapTileLayerProps) {
  const map = useMap()
  const styleOption = mapStyles.find((s) => s.value === style) || mapStyles[0]

  useEffect(() => {
    if (!map) return

    let tileLayer: L.TileLayer | null = null

    try {
      map.eachLayer((layer) => {
        if (layer instanceof L.TileLayer) {
          map.removeLayer(layer)
        }
      })

      tileLayer = L.tileLayer.provider(styleOption.provider, styleOption.options || {})
      tileLayer.addTo(map)
    } catch {
      try {
        const fallbackLayer = L.tileLayer.provider('OpenStreetMap.Mapnik')
        fallbackLayer.addTo(map)
        tileLayer = fallbackLayer
      } catch {
        const basicLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        })
        basicLayer.addTo(map)
        tileLayer = basicLayer
      }
    }

    return () => {
      if (tileLayer && map.hasLayer(tileLayer)) {
        map.removeLayer(tileLayer)
      }
    }
  }, [map, style, styleOption])

  return null
}

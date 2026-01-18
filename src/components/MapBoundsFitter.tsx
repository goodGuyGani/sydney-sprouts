import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'

interface MapBoundsFitterProps {
  positions: [number, number][]
  padding?: [number, number]
}

export function MapBoundsFitter({ positions, padding = [50, 50] }: MapBoundsFitterProps) {
  const map = useMap()
  const previousPositionsRef = useRef<string>('')
  const isUserInteractingRef = useRef(false)
  const hasInitialFitRef = useRef(false)

  useEffect(() => {
    if (!map || positions.length === 0) return

    const positionsKey = JSON.stringify(positions)
    
    if (positionsKey === previousPositionsRef.current) {
      return
    }

    if (isUserInteractingRef.current && hasInitialFitRef.current) {
      return
    }

    previousPositionsRef.current = positionsKey

    const timeoutId = setTimeout(() => {
      if (isUserInteractingRef.current && hasInitialFitRef.current) {
        return
      }

      if (positions.length === 1) {
        if (!hasInitialFitRef.current) {
          map.setView(positions[0], 13, {
            animate: true,
          })
          hasInitialFitRef.current = true
        }
        return
      }

      const bounds = L.latLngBounds(positions)
      map.fitBounds(bounds, {
        padding: padding,
        maxZoom: 16,
        animate: hasInitialFitRef.current,
      })
      hasInitialFitRef.current = true
    }, 150)

    return () => {
      clearTimeout(timeoutId)
    }
  }, [map, positions, padding])

  useEffect(() => {
    const handleMapInteraction = () => {
      isUserInteractingRef.current = true
      setTimeout(() => {
        isUserInteractingRef.current = false
      }, 2000)
    }

    const handlePopupOpen = () => {
      isUserInteractingRef.current = true
      setTimeout(() => {
        isUserInteractingRef.current = false
      }, 1000)
    }

    map.on('click', handleMapInteraction)
    map.on('zoomstart', handleMapInteraction)
    map.on('dragstart', handleMapInteraction)
    map.on('popupopen', handlePopupOpen)

    return () => {
      map.off('click', handleMapInteraction)
      map.off('zoomstart', handleMapInteraction)
      map.off('dragstart', handleMapInteraction)
      map.off('popupopen', handlePopupOpen)
    }
  }, [map])

  return null
}

export async function getRoadRoute(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number
): Promise<[number, number][]> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`
    
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Routing API error: ${response.status}`)
    }

    const data = await response.json()
    
    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      return [[startLat, startLng], [endLat, endLng]]
    }

    const route = data.routes[0]
    const coordinates = route.geometry.coordinates
    
    return coordinates.map((coord: [number, number]) => [coord[1], coord[0]] as [number, number])
  } catch (error) {
    return [[startLat, startLng], [endLat, endLng]]
  }
}

export async function getRouteForAllStops(
  positions: [number, number][]
): Promise<[number, number][]> {
  if (positions.length < 2) return positions
  
  const allRoutes: [number, number][] = []
  
  for (let i = 0; i < positions.length - 1; i++) {
    const start = positions[i]
    const end = positions[i + 1]
    
    const segment = await getRoadRoute(start[0], start[1], end[0], end[1])
    
    if (i === 0) {
      allRoutes.push(...segment)
    } else {
      allRoutes.push(...segment.slice(1))
    }
  }
  
  return allRoutes
}

export interface GeocodingResult {
  display_name: string
  lat: string
  lon: string
  place_id: number
  type: string
  importance: number
}

export interface GeocodingResponse {
  results: GeocodingResult[]
}

export async function searchPlaces(query: string): Promise<GeocodingResult[]> {
  if (!query.trim()) return []

  try {
    const encodedQuery = encodeURIComponent(query)
    const url = `https://nominatim.openstreetmap.org/search?q=${encodedQuery}&format=json&limit=10&addressdetails=1`
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'DeliverySystem/1.0'
      }
    })

    if (!response.ok) {
      throw new Error(`Geocoding API error: ${response.status}`)
    }

    const results: GeocodingResult[] = await response.json()
    return results.sort((a, b) => b.importance - a.importance)
  } catch (error) {
    return []
  }
}

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'DeliverySystem/1.0'
      }
    })

    if (!response.ok) {
      return null
    }

    const data = await response.json()
    return data.display_name || null
  } catch (error) {
    return null
  }
}

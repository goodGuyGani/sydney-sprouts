const normalizeUrl = (url: string): string => {
  let normalized = url.trim()
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = `https://${normalized}`
  }
  return normalized.replace(/\/$/, '')
}

const rawUrl = import.meta.env.VITE_DATAVERSE_URL || 'https://pacerprojects.crm6.dynamics.com'
export const DATAVERSE_ENVIRONMENT_URL = normalizeUrl(rawUrl)

export const getDataverseApiUrl = (path: string = ''): string => {
  if (!path) {
    return `${DATAVERSE_ENVIRONMENT_URL}/api/data/v9.2`
  }
  const apiPath = path.startsWith('/') ? path : `/${path}`
  return `${DATAVERSE_ENVIRONMENT_URL}/api/data/v9.2${apiPath}`
}

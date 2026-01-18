import type { Configuration, PopupRequest } from '@azure/msal-browser'

export const msalConfig: Configuration = {
  auth: {
    clientId: '477a04b8-1835-4813-b1e7-81ae3917c563',
    authority: 'https://login.microsoftonline.com/e571e05f-df5a-4cac-af8b-272965d6a1cc',
    redirectUri: 'http://localhost:5173',
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
}

export const loginRequest: PopupRequest = {
  scopes: ['User.Read'],
}

export const dataverseRequest: PopupRequest = {
  scopes: ['https://pacerprojects.crm6.dynamics.com/.default'],
}

export const getDataverseScope = (environmentUrl: string): string => {
  let urlString = environmentUrl.trim()
  
  if (!urlString.startsWith('http://') && !urlString.startsWith('https://')) {
    urlString = `https://${urlString}`
  }
  
  try {
    const url = new URL(urlString)
    return `https://${url.hostname}/.default`
  } catch {
    throw new Error(`Invalid Dataverse environment URL: ${environmentUrl}. Could not parse URL.`)
  }
}

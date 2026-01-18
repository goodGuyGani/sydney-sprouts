import { useMsal } from '@azure/msal-react'
import { AuthenticationResult, SilentRequest, InteractionRequiredAuthError } from '@azure/msal-browser'
import { getDataverseScope } from '@/lib/msalConfig'
import { DATAVERSE_ENVIRONMENT_URL } from '@/lib/dataverseConfig'
import { useCallback, useState } from 'react'

export function useDataverseToken() {
  const { instance, accounts } = useMsal()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    if (accounts.length === 0) {
      setError(new Error('No account found. Please sign in first.'))
      return null
    }

    setIsLoading(true)
    setError(null)

    const account = accounts[0]
    const scope = getDataverseScope(DATAVERSE_ENVIRONMENT_URL)

    try {
      const silentRequest: SilentRequest = {
        scopes: [scope],
        account: account,
      }

      const response: AuthenticationResult = await instance.acquireTokenSilent(silentRequest)
      return response.accessToken
    } catch (silentError) {
      if (silentError instanceof InteractionRequiredAuthError) {
        try {
          const popupRequest = {
            scopes: [scope],
            account: account,
          }

          const response: AuthenticationResult = await instance.acquireTokenPopup(popupRequest)
          return response.accessToken
        } catch (popupError) {
          const errorMessage = popupError instanceof Error 
            ? popupError.message 
            : 'Unknown error occurred'
          
          const error = new Error(
            `Failed to acquire Dataverse token. Scope: ${scope}. Error: ${errorMessage}`
          )
          setError(error)
          return null
        }
      } else {
        const errorMessage = silentError instanceof Error 
          ? silentError.message 
          : 'Unknown error occurred'
        
        const error = new Error(
          `Failed to acquire Dataverse token silently. Scope: ${scope}. Error: ${errorMessage}`
        )
        setError(error)
        return null
      }
    } finally {
      setIsLoading(false)
    }
  }, [instance, accounts])

  return { getAccessToken, isLoading, error }
}

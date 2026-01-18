import { MsalProvider as MsalProviderBase } from '@azure/msal-react'
import { PublicClientApplication } from '@azure/msal-browser'
import { msalConfig } from '@/lib/msalConfig'
import { ReactNode } from 'react'

const msalInstance = new PublicClientApplication(msalConfig)
msalInstance.initialize()

interface MsalProviderProps {
  children: ReactNode
}

export function MsalProvider({ children }: MsalProviderProps) {
  return <MsalProviderBase instance={msalInstance}>{children}</MsalProviderBase>
}

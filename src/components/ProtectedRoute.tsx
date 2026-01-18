import { useIsAuthenticated, useMsal } from '@azure/msal-react'
import { Navigate } from 'react-router-dom'
import { Spinner } from '@/components/ui/spinner'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { inProgress } = useMsal()
  const isAuthenticated = useIsAuthenticated()

  if (inProgress === 'login' || inProgress === 'ssoSilent') {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Spinner className="size-8" />
          <p className="text-sm text-muted-foreground">Signing in...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

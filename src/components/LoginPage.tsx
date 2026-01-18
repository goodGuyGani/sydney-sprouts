import { useMsal, useIsAuthenticated } from '@azure/msal-react'
import { loginRequest } from '@/lib/msalConfig'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { LogIn, Shield, Truck } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

export function LoginPage() {
  const { instance } = useMsal()
  const isAuthenticated = useIsAuthenticated()
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (isAuthenticated) {
      void navigate('/admin', { replace: true })
    }
  }, [isAuthenticated, navigate])

  const handleLogin = async () => {
    setIsLoading(true)
    try {
      await instance.loginPopup(loginRequest)
      toast.success('Login successful', {
        description: 'Welcome to Delivery System',
      })
      void navigate('/admin', { replace: true })
    } catch (error) {
      if (error instanceof Error && error.message !== 'user_cancelled') {
        toast.error('Login failed', {
          description: 'Please try again.',
        })
      }
    } finally {
      setIsLoading(false)
    }
  }

  if (isAuthenticated) {
    return null
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-gradient-to-br from-background via-background to-muted/20 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Truck className="size-8 text-primary" />
          </div>
          <div>
            <CardTitle className="text-2xl">Delivery System</CardTitle>
            <CardDescription className="mt-2 text-base">
              Operations Console
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3 rounded-lg border bg-muted/50 p-4">
            <div className="flex items-start gap-3">
              <Shield className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
              <div className="space-y-1">
                <div className="text-sm font-medium">Secure Access</div>
                <div className="text-xs text-muted-foreground">
                  Sign in with your Microsoft account to access the delivery management system.
                </div>
              </div>
            </div>
          </div>
          <Button
            onClick={() => void handleLogin()}
            disabled={isLoading}
            className="w-full"
            size="lg"
          >
            {isLoading ? (
              <>
                <Spinner className="mr-2 size-4" />
                Signing in...
              </>
            ) : (
              <>
                <LogIn className="mr-2 size-4" />
                Sign in with Microsoft
              </>
            )}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Your credentials are securely managed by Microsoft Azure AD
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

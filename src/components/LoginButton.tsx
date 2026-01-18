import { useMsal, useIsAuthenticated } from '@azure/msal-react'
import { loginRequest } from '@/lib/msalConfig'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

export function LoginButton() {
  const { instance } = useMsal()
  const isAuthenticated = useIsAuthenticated()

  const handleLogin = async () => {
    try {
      await instance.loginPopup(loginRequest)
    } catch (error) {
      if (error instanceof Error && error.message !== 'user_cancelled') {
        alert('Login failed. Please try again.')
      }
    }
  }

  const handleLogout = () => {
    instance.logoutPopup()
  }

  const accounts = instance.getAllAccounts()
  const activeAccount = accounts[0]

  if (isAuthenticated && activeAccount) {
    const initials = activeAccount.name
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'U'

    return (
      <div className="flex items-center gap-3">
        <div className="flex flex-col items-end">
          <span className="text-sm font-medium">{activeAccount.name}</span>
          <span className="text-xs text-muted-foreground">{activeAccount.username}</span>
        </div>
        <Avatar>
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <Button variant="outline" onClick={handleLogout}>
          Sign Out
        </Button>
      </div>
    )
  }

  return (
    <Button onClick={handleLogin}>Sign In with Microsoft</Button>
  )
}

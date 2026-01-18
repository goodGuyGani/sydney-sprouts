import { useIsAuthenticated } from '@azure/msal-react'
import { Button } from '@/components/ui/button'
import { LoginButton } from '@/components/LoginButton'
import { DataverseTables } from '@/components/DataverseTables'

function App() {
  const isAuthenticated = useIsAuthenticated()

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex flex-col gap-0.5">
            <div className="text-base font-bold tracking-wide">Delivery System</div>
            <div className="text-xs text-muted-foreground">Operations Console</div>
          </div>
          <LoginButton />
        </div>
      </header>
      <main className="container mx-auto flex flex-1 flex-col gap-4 p-5">
        {isAuthenticated ? (
          <>
            <section className="rounded-lg border bg-card p-4 shadow-sm">
              <h1 className="mb-2 text-lg font-semibold">Dashboard</h1>
              <p className="mb-4 max-w-prose text-sm text-muted-foreground">
                This is the secure desktop/mobile shell. Add your modules (orders, riders, dispatch, settings) as routed
                screens.
              </p>
            </section>
            <DataverseTables />
          </>
        ) : (
          <section className="rounded-lg border bg-card p-8 shadow-sm">
            <div className="flex flex-col items-center justify-center gap-4 text-center">
              <h1 className="text-2xl font-semibold">Welcome to Delivery System</h1>
              <p className="max-w-prose text-sm text-muted-foreground">
                Please sign in with your Microsoft account to access the operations console.
              </p>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

export default App

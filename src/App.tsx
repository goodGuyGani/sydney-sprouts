import { Button } from '@/components/ui/button'

function App() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex flex-col gap-0.5">
            <div className="text-base font-bold tracking-wide">Delivery System</div>
            <div className="text-xs text-muted-foreground">Operations Console</div>
          </div>
        </div>
      </header>
      <main className="container mx-auto flex flex-1 flex-col gap-4 p-5">
        <section className="rounded-lg border bg-card p-4 shadow-sm">
          <h1 className="mb-2 text-lg font-semibold">Dashboard</h1>
          <p className="mb-4 max-w-prose text-sm text-muted-foreground">
            This is the secure desktop/mobile shell. Add your modules (orders, riders, dispatch, settings) as routed
            screens.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button>Click me</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App

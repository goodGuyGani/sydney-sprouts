import { useState } from 'react'
import { LoginButton } from '@/components/LoginButton'
import { RouteMapCreator } from '@/components/RouteMapCreator'
import { DeliveryRoutesTable } from '@/components/DeliveryRoutesTable'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MapPin, List } from 'lucide-react'

export function AdminPage() {
  const [activeTab, setActiveTab] = useState('create')

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
      <main className="container mx-auto flex-1 p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="create" className="flex items-center gap-2">
              <MapPin className="size-4" />
              Create Route
            </TabsTrigger>
            <TabsTrigger value="view" className="flex items-center gap-2">
              <List className="size-4" />
              View Routes
            </TabsTrigger>
          </TabsList>
          <TabsContent value="create" className="mt-4">
            <RouteMapCreator onSaveSuccess={() => setActiveTab('view')} />
          </TabsContent>
          <TabsContent value="view" className="mt-4">
            <DeliveryRoutesTable />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}

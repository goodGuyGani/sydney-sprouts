import { useState } from 'react'
import { RouteMapCreator } from '@/components/RouteMapCreator'
import { DeliveryRoutesTable } from '@/components/DeliveryRoutesTable'
import { AdminSidebar } from '@/components/AdminSidebar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Separator } from '@/components/ui/separator'
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { MapPin, List } from 'lucide-react'

export function AdminPage() {
  const [activeTab, setActiveTab] = useState('create')

  const handleNavClick = (value?: string) => {
    if (value) {
      setActiveTab(value)
    }
  }

  return (
    <SidebarProvider>
      <AdminSidebar activeTab={activeTab} onNavClick={handleNavClick} />

      <SidebarInset className="flex min-h-svh flex-col">
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="#">Delivery System</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>
                    {activeTab === 'create' ? 'Create Route' : 'View Routes'}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0 overflow-auto">
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
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

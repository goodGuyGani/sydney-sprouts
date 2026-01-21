import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Truck } from 'lucide-react'
import { OperationsDashboard } from '@/components/OperationsDashboard'
import { RouteCreationPage } from '@/components/RouteCreationPage'
import { DeliveryRoutesTable } from '@/components/DeliveryRoutesTable'
import { NavigationDock } from '@/components/NavigationDock'
import { cn } from '@/lib/utils'

export function AdminPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const [activeTab, setActiveTab] = useState(tabParam || 'analytics-dashboard')

  useEffect(() => {
    if (tabParam) {
      setActiveTab(tabParam)
    }
  }, [tabParam])

  const handleNavClick = (value: string) => {
    setActiveTab(value)
    setSearchParams({ tab: value })
  }

  const getPageTitle = () => {
    if (activeTab === 'create') return 'Create Route'
    if (activeTab === 'view') return 'View Routes'
    if (activeTab === 'analytics-dashboard') return 'Dashboard'
    return 'Dashboard'
  }

  return (
    <div className="flex min-h-svh flex-col bg-muted/30">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60 px-4">
        <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-linear-to-br from-cyan-400 to-blue-500 text-white shadow-lg shadow-cyan-500/50">
          <Truck className="size-4" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm text-muted-foreground">Delivery System</span>
          <span className="text-lg font-semibold">{getPageTitle()}</span>
        </div>
      </header>

      <div className={cn(
        "flex-1 overflow-auto",
        activeTab === 'analytics-dashboard' ? "" : ""
      )}>
        {activeTab === 'analytics-dashboard' ? (
          <OperationsDashboard />
        ) : activeTab === 'create' ? (
          <RouteCreationPage onSaveSuccess={() => handleNavClick('analytics-dashboard')} />
        ) : activeTab === 'view' ? (
          <div className="p-6">
            <DeliveryRoutesTable />
          </div>
        ) : null}
      </div>

      <NavigationDock activeTab={activeTab} onNavClick={handleNavClick} />
    </div>
  )
}

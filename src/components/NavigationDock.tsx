import { useState, useRef, useEffect } from 'react'
import { useMsal } from '@azure/msal-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Avatar,
  AvatarFallback,
} from '@/components/ui/avatar'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  LogOut,
  Settings2,
  Route,
  BarChart3,
  Users,
  Truck,
  MapPin,
  List,
  ChevronRight,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/use-mobile'

export interface NavItem {
  title: string
  value?: string
  icon: React.ComponentType<{ className?: string }>
  badge?: number
}

export interface NavGroup {
  title: string
  icon: React.ComponentType<{ className?: string }>
  items: NavItem[]
}

export const navGroups: NavGroup[] = [
  {
    title: 'Routes',
    icon: Route,
    items: [
      {
        title: 'Create Route',
        value: 'create',
        icon: MapPin,
      },
      {
        title: 'View Routes',
        value: 'view',
        icon: List,
      },
    ],
  },
  {
    title: 'Analytics',
    icon: BarChart3,
    items: [
      {
        title: 'Dashboard',
        value: 'analytics-dashboard',
        icon: BarChart3,
      },
      {
        title: 'Reports',
        value: 'analytics-reports',
        icon: BarChart3,
      },
      {
        title: 'Performance',
        value: 'analytics-performance',
        icon: BarChart3,
      },
    ],
  },
  {
    title: 'Management',
    icon: Users,
    items: [
      {
        title: 'Drivers',
        value: 'management-drivers',
        icon: Users,
      },
      {
        title: 'Vehicles',
        value: 'management-vehicles',
        icon: Truck,
      },
      {
        title: 'Customers',
        value: 'management-customers',
        icon: Users,
      },
    ],
  },
]

interface NavigationDockProps {
  activeTab: string
  onNavClick: (value: string) => void
}

export function NavigationDock({ activeTab, onNavClick }: NavigationDockProps) {
  const isMobile = useIsMobile()
  const { instance } = useMsal()
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
  const dockRef = useRef<HTMLDivElement>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const accounts = instance?.getAllAccounts() || []
  const activeAccount = accounts[0]

  const handleLogout = async () => {
    if (!instance) return
    try {
      await instance.logoutPopup()
      toast.success('Logged out successfully')
    } catch (error) {
      if (error instanceof Error && error.message !== 'user_cancelled') {
        toast.error('Logout failed', {
          description: 'Please try again.',
        })
      }
    }
  }

  const userInitials = activeAccount?.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U'

  const handleGroupMouseEnter = (groupId: string) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    setExpandedGroup(groupId)
  }

  const handleGroupMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setExpandedGroup(null)
    }, 200)
  }

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])


  return (
    <TooltipProvider delayDuration={300}>
      <div
        ref={dockRef}
        className={cn(
          'fixed z-[9999] flex items-center gap-2',
          isMobile
            ? 'bottom-0 left-0 right-0 h-16 px-2 bg-background/95 backdrop-blur-md border-t shadow-lg'
            : 'bottom-6 left-1/2 -translate-x-1/2 h-16 px-4 bg-background/95 backdrop-blur-xl border rounded-2xl shadow-2xl'
        )}
      >
        {isMobile && (
          <Sheet open={mobileSheetOpen} onOpenChange={setMobileSheetOpen}>
            <SheetContent side="bottom" className="h-[60vh] rounded-t-2xl">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  {selectedGroup && (() => {
                    const group = navGroups.find(g => g.title === selectedGroup)
                    const GroupIcon = group?.icon || Route
                    return (
                      <>
                        <GroupIcon className="w-5 h-5" />
                        {selectedGroup}
                      </>
                    )
                  })()}
                </SheetTitle>
              </SheetHeader>
              {selectedGroup && (() => {
                const group = navGroups.find(g => g.title === selectedGroup)
                if (!group) return null
                return (
                  <div className="mt-6 space-y-2">
                    {group.items.map((item) => {
                      const ItemIcon = item.icon
                      const isItemActive = item.value === activeTab
                      return (
                        <button
                          key={item.title}
                          onClick={() => {
                            if (item.value) {
                              onNavClick(item.value)
                              setMobileSheetOpen(false)
                              setSelectedGroup(null)
                            }
                          }}
                          className={cn(
                            'w-full flex items-center gap-3 px-4 py-3 rounded-lg text-base transition-all duration-200',
                            'active:bg-accent active:text-accent-foreground',
                            isItemActive
                              ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-foreground font-medium border-l-4 border-cyan-500'
                              : 'text-muted-foreground'
                          )}
                        >
                          <ItemIcon className="w-5 h-5" />
                          <span className="flex-1 text-left">{item.title}</span>
                          {item.badge && (
                            <span className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded-full">
                              {item.badge}
                            </span>
                          )}
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </button>
                      )
                    })}
                  </div>
                )
              })()}
            </SheetContent>
          </Sheet>
        )}

        <div className="flex items-center gap-1 flex-1 justify-center">
          {navGroups.map((group) => {
            const isActive = group.items.some(item => item.value === activeTab)
            const isExpanded = expandedGroup === group.title
            const GroupIcon = group.icon

            return isMobile ? (
              <button
                key={group.title}
                onClick={() => {
                  setSelectedGroup(group.title)
                  setMobileSheetOpen(true)
                }}
                className={cn(
                  'relative flex items-center justify-center w-12 h-12 rounded-xl transition-all duration-300',
                  'active:scale-95',
                  isActive
                    ? 'bg-gradient-to-br from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/50'
                    : 'bg-muted/50 text-muted-foreground'
                )}
              >
                <GroupIcon className="w-5 h-5 transition-transform duration-300" />
                {isActive && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-background animate-pulse" />
                )}
              </button>
            ) : (
              <div
                key={group.title}
                className="relative"
                onMouseEnter={() => handleGroupMouseEnter(group.title)}
                onMouseLeave={handleGroupMouseLeave}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => {
                        const firstItem = group.items[0]
                        if (firstItem?.value) {
                          onNavClick(firstItem.value)
                        }
                      }}
                      className={cn(
                        'relative flex items-center justify-center w-12 h-12 rounded-xl transition-all duration-300',
                        'hover:scale-110 active:scale-95',
                        isActive
                          ? 'bg-gradient-to-br from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/50'
                          : 'bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <GroupIcon className="w-5 h-5 transition-transform duration-300" />
                      {isActive && (
                        <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-background animate-pulse" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="mb-2">
                    <p className="font-medium">{group.title}</p>
                  </TooltipContent>
                </Tooltip>

                {isExpanded && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 flex flex-col gap-1 min-w-[180px] bg-popover border rounded-xl shadow-xl p-2 animate-in fade-in-0 zoom-in-95 duration-200 z-[10000]">
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {group.title}
                    </div>
                    {group.items.map((item) => {
                      const ItemIcon = item.icon
                      const isItemActive = item.value === activeTab
                      return (
                        <button
                          key={item.title}
                          onClick={() => {
                            if (item.value) {
                              onNavClick(item.value)
                              setExpandedGroup(null)
                            }
                          }}
                          className={cn(
                            'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200',
                            'hover:bg-accent hover:text-accent-foreground',
                            isItemActive
                              ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-foreground font-medium border-l-2 border-cyan-500'
                              : 'text-muted-foreground'
                          )}
                        >
                          <ItemIcon className="w-4 h-4" />
                          <span className="flex-1 text-left">{item.title}</span>
                          {item.badge && (
                            <span className="px-1.5 py-0.5 text-xs bg-primary text-primary-foreground rounded-full">
                              {item.badge}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="h-8 w-px bg-border mx-1" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="relative flex items-center justify-center w-12 h-12 rounded-xl transition-all duration-300 hover:scale-110 active:scale-95 bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground">
              <Avatar className="h-8 w-8 rounded-lg ring-2 ring-cyan-400/50">
                <AvatarFallback className="rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 text-white font-bold text-xs">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-56 rounded-xl mb-2 z-[10000]"
            side="top"
            align="end"
            sideOffset={8}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarFallback className="rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 text-white">
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">
                    {activeAccount?.name || 'User'}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {activeAccount?.username || 'Not signed in'}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <Settings2 className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void handleLogout()}>
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </TooltipProvider>
  )
}

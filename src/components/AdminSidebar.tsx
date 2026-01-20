import { useMsal } from '@azure/msal-react'
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarRail,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from '@/components/ui/sidebar'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
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
  ChevronRight,
  ChevronsUpDown,
  LogOut,
  Settings2,
  Truck,
  Route,
  BarChart3,
  Users,
} from 'lucide-react'
import { useIsMobile } from '@/hooks/use-mobile'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export interface NavItem {
  title: string
  url: string
  value?: string
}

export interface NavMainItem {
  title: string
  url: string
  icon: React.ComponentType<{ className?: string }>
  isActive?: boolean
  items: NavItem[]
}

export const navMain: NavMainItem[] = [
  {
    title: 'Routes',
    url: '#',
    icon: Route,
    isActive: true,
    items: [
      {
        title: 'Create Route',
        url: '#',
        value: 'create',
      },
      {
        title: 'View Routes',
        url: '#',
        value: 'view',
      },
    ],
  },
  {
    title: 'Analytics',
    url: '#',
    icon: BarChart3,
    items: [
      {
        title: 'Dashboard',
        url: '#',
      },
      {
        title: 'Reports',
        url: '#',
      },
      {
        title: 'Performance',
        url: '#',
      },
    ],
  },
  {
    title: 'Management',
    url: '#',
    icon: Users,
    items: [
      {
        title: 'Drivers',
        url: '#',
      },
      {
        title: 'Vehicles',
        url: '#',
      },
      {
        title: 'Customers',
        url: '#',
      },
    ],
  },
  {
    title: 'Settings',
    url: '#',
    icon: Settings2,
    items: [
      {
        title: 'General',
        url: '#',
      },
      {
        title: 'Notifications',
        url: '#',
      },
      {
        title: 'Security',
        url: '#',
      },
    ],
  },
]

interface AdminSidebarProps {
  activeTab: string
  onNavClick: (value?: string) => void
}

export function AdminSidebar({ activeTab, onNavClick }: AdminSidebarProps) {
  const isMobile = useIsMobile()
  const { instance } = useMsal()

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

  return (
    <Sidebar 
      collapsible="icon"
      className="bg-gradient-to-b from-cyan-500/20 via-blue-500/15 to-cyan-600/20 border-r border-cyan-400/30"
    >
      <SidebarHeader className="bg-gradient-to-r from-cyan-500/30 via-blue-500/20 to-transparent border-b border-cyan-400/20">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="hover:bg-cyan-500/20 transition-all">
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 text-white shadow-lg shadow-cyan-500/50">
                <Truck className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-bold text-black">Delivery System</span>
                <span className="truncate text-xs text-black/70">Operations Console</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="bg-gradient-to-b from-transparent via-cyan-500/5 to-transparent">
        <SidebarGroup>
          <SidebarGroupLabel className="text-black/80 font-semibold text-xs uppercase tracking-wider px-3 py-2">
            Navigation
          </SidebarGroupLabel>
          <SidebarMenu>
            {navMain.map((item) => (
              <Collapsible
                key={item.title}
                asChild
                defaultOpen={item.isActive}
                className="group/collapsible"
              >
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton 
                      tooltip={item.title} 
                      className="transition-all duration-300 hover:bg-gradient-to-r hover:from-cyan-500/30 hover:to-blue-500/20 hover:text-black hover:shadow-md hover:shadow-cyan-500/20 rounded-lg mx-2 my-1 group-hover/item:translate-x-1"
                    >
                      {item.icon && (
                        <item.icon className="transition-all duration-300 text-cyan-600 group-hover/item:text-cyan-500 group-hover/item:scale-110" />
                      )}
                      <span className="font-medium text-black">{item.title}</span>
                      <ChevronRight className="ml-auto size-4 transition-transform duration-300 ease-in-out group-data-[state=open]/collapsible:rotate-90 text-cyan-600/70" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub className="ml-2 border-l-2 border-cyan-400/30 pl-2">
                      {item.items?.map((subItem) => (
                        <SidebarMenuSubItem key={subItem.title}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={subItem.value === activeTab}
                            className={cn(
                              "transition-all duration-300 rounded-md mx-1 my-0.5",
                              subItem.value === activeTab
                                ? "bg-gradient-to-r from-cyan-500/40 to-blue-500/30 text-black shadow-md shadow-cyan-500/30 border border-cyan-400/50 font-semibold"
                                : "hover:bg-cyan-500/20 hover:text-black hover:translate-x-1 text-black/80"
                            )}
                          >
                            <a
                              href={subItem.url}
                              onClick={(e) => {
                                e.preventDefault()
                                if (subItem.value) {
                                  onNavClick(subItem.value)
                                }
                              }}
                              className="transition-colors duration-200 flex items-center gap-2"
                            >
                              <div className={cn(
                                "size-1.5 rounded-full transition-all",
                                subItem.value === activeTab 
                                  ? "bg-cyan-300 shadow-sm shadow-cyan-300" 
                                  : "bg-cyan-500/50"
                              )} />
                              <span>{subItem.title}</span>
                            </a>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="bg-gradient-to-t from-cyan-500/20 via-blue-500/10 to-transparent border-t border-cyan-400/20">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-gradient-to-r data-[state=open]:from-cyan-500/30 data-[state=open]:to-blue-500/20 data-[state=open]:text-cyan-50 hover:bg-gradient-to-r hover:from-cyan-500/20 hover:to-blue-500/10 transition-all rounded-lg mx-2"
                >
                  <Avatar className="h-8 w-8 rounded-lg ring-2 ring-cyan-400/50 shadow-lg shadow-cyan-500/30">
                    <AvatarFallback className="rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 text-white font-bold">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold text-black">
                      {activeAccount?.name || 'User'}
                    </span>
                    <span className="truncate text-xs text-black/70">
                      {activeAccount?.username || 'Not signed in'}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4 text-cyan-400/70" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg z-1001"
                side={isMobile ? 'bottom' : 'right'}
                align="end"
                sideOffset={4}
              >
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                    <Avatar className="h-8 w-8 rounded-lg">
                      <AvatarFallback className="rounded-lg">
                        {userInitials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">
                        {activeAccount?.name || 'User'}
                      </span>
                      <span className="truncate text-xs">
                        {activeAccount?.username || 'Not signed in'}
                      </span>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem>
                    <Settings2 />
                    Settings
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void handleLogout()}>
                  <LogOut />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}


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
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg">
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <Truck className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">Delivery System</span>
                <span className="truncate text-xs">Operations Console</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
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
                    <SidebarMenuButton tooltip={item.title} className="transition-all duration-200 hover:bg-sidebar-accent/50">
                      {item.icon && <item.icon className="transition-colors duration-200" />}
                      <span>{item.title}</span>
                      <ChevronRight className="ml-auto size-4 transition-transform duration-300 ease-in-out group-data-[state=open]/collapsible:rotate-90" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {item.items?.map((subItem) => (
                        <SidebarMenuSubItem key={subItem.title}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={subItem.value === activeTab}
                            className="transition-all duration-200"
                          >
                            <a
                              href={subItem.url}
                              onClick={(e) => {
                                e.preventDefault()
                                if (subItem.value) {
                                  onNavClick(subItem.value)
                                }
                              }}
                              className="transition-colors duration-200"
                            >
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

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
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
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg z-[1001]"
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


import { Outlet, Link, useLocation, Navigate, useNavigate } from "react-router";
import { useState, useEffect } from "react";
import { Bell, Search, ChevronDown, Menu, X, Moon, Sun, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Badge } from "./ui/badge";
import { ScrollArea } from "./ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { useRbac } from "../../lib/rbac/RbacContext";
import { getNavForRole } from "../../lib/rbac/navigation";
import { Role } from "../../lib/rbac/roles"
import { clearAuthToken } from "../../lib/authApi";

const SIDEBAR_COLLAPSED_KEY = "sidebar-collapsed";

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return saved ? JSON.parse(saved) : false;
  });
  const [darkMode, setDarkMode] = useState(false);
  const { user, roleLabel, setUser } = useRbac();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Persist sidebar collapsed state to localStorage
  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, JSON.stringify(sidebarCollapsed));
  }, [sidebarCollapsed]);

  // Derive navigation from the current user's role (fallback to master_vendor)
  const currentRole = (user?.role ?? Role.MASTER_VENDOR) as Role;
  const navigation = getNavForRole(currentRole);

  const displayName = user?.name ?? "Vendor User";
  const displayRole = roleLabel || "Master Vendor";
  const avatarInitials = user?.avatarInitials ??
    displayName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

  const isActive = (path: string) => {
    const [pathname] = path.split("?");
    if (pathname === "/") {
      return location.pathname === "/";
    }
    return location.pathname.startsWith(pathname);
  };
  const isDesignerRoute = location.pathname.startsWith("/designer-studio");

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
    document.documentElement.classList.toggle("dark");
  };

  const handleProfileClick = () => {
    console.log("[AccountMenu] Profile clicked");
    setAccountMenuOpen(false);
    navigate("/profile");
  };

  const handleSettingsClick = () => {
    console.log("[AccountMenu] Settings clicked");
    setAccountMenuOpen(false);
    navigate("/settings");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 bg-sidebar transform transition-all duration-300 ease-in-out border-r border-sidebar-border lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        } ${sidebarCollapsed ? "w-20" : "w-64"}`}
      >
        <div className="flex h-full flex-col">
          {/* Logo Header */}
          <div className="flex h-16 items-center justify-between px-3 lg:px-6 border-b border-sidebar-border">
            {!sidebarCollapsed && (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-secondary to-accent flex items-center justify-center">
                  <span className="text-white font-bold text-sm">PS</span>
                </div>
                <span className="text-sidebar-foreground font-semibold hidden lg:inline">PrintSaaS</span>
              </div>
            )}
            {sidebarCollapsed && (
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-secondary to-accent flex items-center justify-center">
                <span className="text-white font-bold text-sm">PS</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="hidden lg:inline-flex text-sidebar-foreground hover:bg-sidebar-accent"
                      onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                    >
                      {sidebarCollapsed ? (
                        <ChevronRight className="h-4 w-4" />
                      ) : (
                        <ChevronLeft className="h-4 w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    {sidebarCollapsed ? "Expand" : "Collapse"}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden text-sidebar-foreground"
                onClick={() => setSidebarOpen(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Navigation */}
          <ScrollArea className="flex-1 min-h-0 px-2 lg:px-3 py-4">
            <nav className="space-y-1">
              <TooltipProvider>
                {navigation.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.path);
                  return (
                    <Tooltip key={item.path}>
                      <TooltipTrigger asChild>
                        <Link
                          to={item.path}
                          onClick={() => setSidebarOpen(false)}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all whitespace-nowrap ${
                            active
                              ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-lg shadow-sidebar-primary/20"
                              : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                          } ${sidebarCollapsed && "lg:justify-center"}`}
                        >
                          <Icon className="h-5 w-5 shrink-0" />
                          {!sidebarCollapsed && (
                            <span className="text-sm">{item.name}</span>
                          )}
                        </Link>
                      </TooltipTrigger>
                      {sidebarCollapsed && (
                        <TooltipContent side="right">
                          {item.name}
                        </TooltipContent>
                      )}
                    </Tooltip>
                  );
                })}
              </TooltipProvider>
            </nav>
          </ScrollArea>

          {/* User Profile */}
          <div className="border-t border-sidebar-border p-3 lg:p-4">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={`flex items-center gap-3 ${sidebarCollapsed && "lg:justify-center"}`}>
                    <Avatar className="h-10 w-10">
                      <AvatarImage src="" />
                      <AvatarFallback className="bg-gradient-to-br from-secondary to-accent text-white text-xs">
                        {avatarInitials}
                      </AvatarFallback>
                    </Avatar>
                    {!sidebarCollapsed && (
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-sidebar-foreground truncate">
                          {displayName}
                        </p>
                        <p className="text-xs text-sidebar-foreground/70 truncate">
                          {displayRole}
                        </p>
                      </div>
                    )}
                  </div>
                </TooltipTrigger>
                {sidebarCollapsed && (
                  <TooltipContent side="right" className="flex flex-col">
                    <p className="font-medium">{displayName}</p>
                    <p className="text-xs">{displayRole}</p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </aside>

      {/* Main Content Container */}
      <div 
        className="transition-all duration-300 ease-in-out"
        style={{
          "--sidebar-width": sidebarCollapsed ? "5rem" : "16rem"
        } as React.CSSProperties & { "--sidebar-width": string }}
      >
        <style>{`
          @media (min-width: 1024px) {
            [data-sidebar-main="true"] {
              padding-left: var(--sidebar-width, 16rem);
            }
          }
        `}</style>
        <div data-sidebar-main="true">
          {/* Top Bar */}
        <header className="sticky top-0 z-40 border-b bg-card px-4 py-3 shadow-sm lg:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Left Section: mobile menu + search */}
            <div className="flex w-full items-center gap-3 lg:w-auto lg:flex-1">
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 lg:hidden"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </Button>

              <div className="relative w-full max-w-xl">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search clients, projects, orders..."
                  className="h-10 border-0 bg-muted/50 pl-9"
                />
              </div>
            </div>

            {/* Right Section: notifications + theme + profile */}
            <div className="flex w-full items-center justify-end gap-2 sm:gap-3 lg:w-auto">
              <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                  <Bell className="h-5 w-5" />
                  <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-destructive text-[10px]">
                    5
                  </Badge>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <div className="max-h-96 overflow-y-auto">
                  <DropdownMenuItem className="flex-col items-start p-3">
                    <div className="flex items-center gap-2 w-full">
                      <Badge variant="destructive" className="text-xs">
                        Urgent
                      </Badge>
                      <span className="text-xs text-muted-foreground ml-auto">
                        2 min ago
                      </span>
                    </div>
                    <p className="text-sm mt-1">
                      Payment overdue for Client ABC School
                    </p>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="flex-col items-start p-3">
                    <div className="flex items-center gap-2 w-full">
                      <Badge variant="secondary" className="text-xs">
                        Info
                      </Badge>
                      <span className="text-xs text-muted-foreground ml-auto">
                        1 hour ago
                      </span>
                    </div>
                    <p className="text-sm mt-1">
                      New project approval required
                    </p>
                  </DropdownMenuItem>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button variant="ghost" size="icon" onClick={toggleDarkMode}>
              {darkMode ? (
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
              )}
            </Button>

            <DropdownMenu open={accountMenuOpen} onOpenChange={setAccountMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 rounded-lg px-2 py-1.5 sm:px-3">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src="" />
                    <AvatarFallback className="bg-gradient-to-br from-secondary to-accent text-white text-xs">
                      {avatarInitials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden text-sm font-medium sm:inline">{displayName}</span>
                  <ChevronDown className="hidden h-4 w-4 sm:inline" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled>
                  {displayName} ({displayRole})
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer hover:bg-accent" onClick={handleProfileClick}>
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer hover:bg-accent" onClick={handleSettingsClick}>
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => {
                    clearAuthToken();
                    setUser(null);
                    navigate("/login", { replace: true });
                  }}
                >
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          </div>
        </header>

        {/* Page Content */}
        <main className={isDesignerRoute ? "h-[calc(100vh-4rem)] overflow-hidden" : "p-4 lg:p-6"}>
          <Outlet />
        </main>
        </div>
      </div>

      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}

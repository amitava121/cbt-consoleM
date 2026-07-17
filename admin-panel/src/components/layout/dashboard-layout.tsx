import {
  Activity,
  BookOpen,
  Building2,
  CalendarClock,
  ChevronDown,
  ClipboardList,
  FolderArchive,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  MapPin,
  Monitor,
  PanelLeft,
  PanelLeftClose,
  UserCog,
  Users,
  UsersRound,
} from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../stores/auth-store";
import { useUIStore } from "../../stores/ui-store";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Separator } from "../ui/separator";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/users", label: "Users", icon: Users, end: false },
  { to: "/institutions", label: "Institutions", icon: Building2, end: false },
  { to: "/centers", label: "Centers", icon: MapPin, end: false },
  { to: "/batches", label: "Batches", icon: UsersRound, end: false },
  { to: "/subjects", label: "Subjects & Topics", icon: BookOpen, end: false },
  {
    to: "/question-banks",
    label: "Question Banks",
    icon: FolderArchive,
    end: false,
  },
  { to: "/questions", label: "Questions", icon: HelpCircle, end: false },
  { to: "/exams", label: "Exams", icon: ClipboardList, end: false },
  {
    to: "/exam-batches",
    label: "Exam Batches",
    icon: CalendarClock,
    end: false,
  },
  {
    to: "/candidates",
    label: "Candidates",
    icon: UserCog,
    end: false,
  },
  {
    to: "/devices",
    label: "Devices",
    icon: Monitor,
    end: false,
  },
  {
    to: "/live-monitor",
    label: "Live Monitor",
    icon: Activity,
    end: false,
  },
];

export default function DashboardLayout() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const initials = user?.role?.charAt(0).toUpperCase() ?? "A";

  return (
    <div className="flex min-h-screen bg-background">
      <aside
        className={`flex flex-col border-r border-border transition-all duration-200 ${
          collapsed ? "w-16" : "w-60"
        }`}
      >
        <div className="flex h-14 items-center gap-2 border-b border-border px-4">
          {!collapsed && (
            <span className="text-lg font-bold tracking-tight">
              CBE Console
            </span>
          )}
          {collapsed && (
            <span className="text-lg font-bold tracking-tight">CBE</span>
          )}
        </div>
        <nav className="flex-1 space-y-1 p-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }`
              }
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-border px-4">
          <Button variant="ghost" size="icon" onClick={toggleSidebar}>
            {collapsed ? (
              <PanelLeft className="h-5 w-5" />
            ) : (
              <PanelLeftClose className="h-5 w-5" />
            )}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2">
                <Avatar className="h-8 w-8">
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                {!collapsed && <ChevronDown className="h-4 w-4" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <div className="px-2 py-1.5 text-sm">
                <p className="font-medium">{user?.role ?? "Admin"}</p>
                <p className="text-xs text-muted-foreground">{user?.id}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleLogout}
                className="text-destructive"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <Separator />
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

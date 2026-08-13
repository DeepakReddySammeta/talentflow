"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Search,
  Users,
  Briefcase,
  CalendarCheck,
  DollarSign,
  UserCog,
  ChevronsLeft,
  Settings,
  Flag,
  User,
  LogOut,
  Upload,
  GraduationCap,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { Role } from "@/lib/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  roles: Role[];
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ["ADMIN", "HR", "MANAGER", "INTERVIEWER"] },
  { label: "Search", href: "/", icon: Search, roles: ["ADMIN", "HR", "MANAGER", "INTERVIEWER"] },
  { label: "Candidates", href: "/candidates", icon: Users, roles: ["ADMIN", "HR", "MANAGER"] },
  { label: "Jobs", href: "/jobs", icon: Briefcase, roles: ["ADMIN", "HR", "MANAGER"] },
  { label: "Interviews", href: "/interviews", icon: CalendarCheck, roles: ["ADMIN", "HR", "MANAGER", "INTERVIEWER"] },
  { label: "My Schedule", href: "/interviews/my-schedule", icon: CalendarCheck, roles: ["INTERVIEWER"] },
  { label: "Offers", href: "/offers", icon: DollarSign, roles: ["ADMIN", "HR", "MANAGER"] },
  { label: "Skills Master", href: "/skills", icon: GraduationCap, roles: ["ADMIN", "HR"] },
  { label: "User Management", href: "/users", icon: UserCog, roles: ["ADMIN"] },
  { label: "Imports & Exports", href: "/imports", icon: Upload, roles: ["ADMIN", "HR"] },
];

export function Sidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  const [collapsed, setCollapsed] = useState(false);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("tf_sidebar_collapsed");
    if (stored) setCollapsed(stored === "true");
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      window.localStorage.setItem("tf_sidebar_collapsed", String(!prev));
      return !prev;
    });
  }

  if (!user) return null;

  const showLabels = !collapsed || hovered;
  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(user.role));
  const initials = user.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <aside
      onMouseEnter={() => collapsed && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`shrink-0 border-r border-border bg-sidebar min-h-screen flex flex-col
        transition-all duration-200 ease-in-out relative z-20
        ${showLabels ? "w-60" : "w-[68px]"}`}
    >
      {/* Logo */}
      <div className="px-4 py-5 border-b border-border/20 flex items-center justify-between overflow-hidden">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-8 w-8 shrink-0 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center">
            TF
          </div>
          <span
            className={`text-sm font-medium text-white whitespace-nowrap transition-opacity duration-150 ${
              showLabels ? "opacity-100" : "opacity-0"
            }`}
          >
            TalentFlow
          </span>
        </div>
        {showLabels && (
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleCollapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="text-white/50 hover:text-white hover:bg-white/10 h-7 w-7 shrink-0"
          >
            <ChevronsLeft size={16} className={`transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`} />
          </Button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-hidden">
        {visibleItems.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={!showLabels ? item.label : undefined}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors whitespace-nowrap ${
                active
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon size={18} className="shrink-0" />
              <span className={`transition-opacity duration-150 ${showLabels ? "opacity-100" : "opacity-0 w-0"}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Profile */}
      <div className="px-3 py-4 border-t border-border/20 overflow-visible">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-full flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-white/10 transition-colors">
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="bg-muted text-foreground text-xs font-medium">
                  {initials}
                </AvatarFallback>
              </Avatar>
              {showLabels && (
                <div className="min-w-0 text-left">
                  <p className="text-sm text-white font-medium truncate">{user.name}</p>
                  <p className="text-xs text-white/50 truncate">
                    {user.role}
                    {user.department ? ` · ${user.department}` : ""}
                  </p>
                </div>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-52">
            <DropdownMenuItem asChild>
              <Link href="/profile" className="flex items-center gap-2 cursor-pointer">
                <User size={15} /> Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings" className="flex items-center gap-2 cursor-pointer">
                <Settings size={15} /> Settings
              </Link>
            </DropdownMenuItem>
            {user.role === "ADMIN" && (
              <DropdownMenuItem asChild>
                <Link href="/feature-flags" className="flex items-center gap-2 cursor-pointer">
                  <Flag size={15} /> Feature flags
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={logout}
              className="flex items-center gap-2 text-muted-foreground cursor-pointer"
            >
              <LogOut size={15} /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}

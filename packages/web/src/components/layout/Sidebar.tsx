"use client";

import React, { useMemo, memo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  BedDouble,
  Users,
  Wifi,
  Tv,
  UserCog,
  BarChart3,
  Settings,
  LogOut,
  ExternalLink,
  X,
  Hotel,
} from "lucide-react";
import { useAuthStore } from "@/lib/auth-store";
import { usePredictivePrefetch } from "@/hooks/usePredictivePrefetch";
import { useNavigationStore } from "@/lib/navigation-store";
import { toast } from "sonner";

interface SidebarProps {
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

const NAV_ITEMS = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Rooms", href: "/rooms", icon: BedDouble },
  { label: "Guests", href: "/guests", icon: Users },
  { label: "Wi-Fi Management", href: "/wifi", icon: Wifi },
  { label: "TV Devices", href: "/devices", icon: Tv },
  { label: "Staff", href: "/staff", icon: UserCog },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Settings", href: "/settings", icon: Settings },
];

function SidebarComponent({ mobileOpen = false, onCloseMobile }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, hotel, clearAuth } = useAuthStore();
  const { prefetchSection } = usePredictivePrefetch();
  const { targetPath, startNavigation } = useNavigationStore();

  const handleLogout = () => {
    clearAuth();
    toast.success("Signed out successfully");
    router.push("/login");
  };

  const role = (user?.role || "STAFF").toUpperCase();
  const isOwnerOrAdmin = role === "OWNER" || role === "ADMIN" || role === "SUPER_ADMIN";
  const isManager = role === "MANAGER";

  const hotelName = hotel?.name || (user?.firstName ? `${user.firstName}'s Hotel` : "Hotel Property");
  const userInitials = user
    ? `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`.toUpperCase() || "SS"
    : "SS";

  // Filter navigation items by role (memoized)
  const visibleNavItems = useMemo(() => {
    return NAV_ITEMS.filter((item) => {
      if (item.href === "/staff") return isOwnerOrAdmin;
      if (item.href === "/settings") return isOwnerOrAdmin || isManager;
      if (item.href === "/reports") return isOwnerOrAdmin || isManager;
      if (item.href === "/wifi") return isOwnerOrAdmin || isManager;
      return true;
    });
  }, [isOwnerOrAdmin, isManager]);

  const content = (
    <div className="h-full flex flex-col justify-between bg-white border-r border-slate-200">
      {/* Top Header / Brand */}
      <div>
        <div className="h-16 px-6 border-b border-slate-100 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-100 group-hover:scale-105 transition-transform">
              <Tv className="w-5 h-5" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-base font-extrabold tracking-tight text-slate-900 group-hover:text-indigo-600 transition-colors">
                SmartStay <span className="text-indigo-600 font-semibold">TV</span>
              </span>
              <span className="text-[11px] font-medium text-slate-500 truncate max-w-[130px]">
                {hotelName}
              </span>
            </div>
          </Link>

          {/* Close button for mobile drawer */}
          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Navigation Links */}
        <div className="px-3 py-4 space-y-1">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const currentRoute = targetPath || pathname;
            const isActive =
              item.href === "/"
                ? currentRoute === "/"
                : currentRoute.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={true}
                onMouseEnter={() => prefetchSection(item.href)}
                onFocus={() => prefetchSection(item.href)}
                onClick={() => {
                  if (item.href !== pathname) {
                    startNavigation(item.href, item.label);
                  }
                  onCloseMobile?.();
                }}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  isActive
                    ? "bg-indigo-50 text-indigo-700 shadow-xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                }`}
              >
                <Icon
                  className={`w-4 h-4 transition-colors ${
                    isActive ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-600"
                  }`}
                />
                <span>{item.label}</span>
                {isActive && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-600" />
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Bottom Area: TV Simulator Quick Link & User Profile Card */}
      <div className="p-3 border-t border-slate-100 space-y-3">
        {/* TV Simulator Direct Link */}
        <Link
          href="/tv-preview"
          target="_blank"
          rel="noopener noreferrer"
          onMouseEnter={() => prefetchSection("/tv-preview")}
          onFocus={() => prefetchSection("/tv-preview")}
          className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500/10 to-indigo-600/5 border border-indigo-200/60 text-indigo-700 hover:bg-indigo-100/60 transition-all text-xs font-semibold"
        >
          <div className="flex items-center gap-2">
            <Tv className="w-4 h-4 text-indigo-600" />
            <span>TV Display Simulator</span>
          </div>
          <ExternalLink className="w-3.5 h-3.5 text-indigo-500" />
        </Link>

        {/* User Badge & Logout */}
        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
              {userInitials}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900 truncate">
                {user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email : "Hotel Admin"}
              </p>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-indigo-600">
                {user?.role || "OWNER"}
              </p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            title="Sign out"
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:block fixed inset-y-0 left-0 w-64 z-30">
        {content}
      </aside>

      {/* Mobile Backdrop & Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
          />
          <div className="fixed inset-y-0 left-0 w-72 max-w-[85vw] shadow-2xl transition-transform">
            {content}
          </div>
        </div>
      )}
    </>
  );
}

export const Sidebar = memo(SidebarComponent);

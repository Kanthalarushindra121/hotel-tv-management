"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  Menu,
  Bell,
  Building,
  User,
  LogOut,
  Settings,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import { useAuthStore } from "@/lib/auth-store";
import { toast } from "sonner";

interface HeaderProps {
  onToggleMobileMenu: () => void;
}

const PAGE_TITLES: Record<string, { title: string; subtitle?: string }> = {
  "/": { title: "Front Desk & Room Hub", subtitle: "Live property overview & check-in management" },
  "/rooms": { title: "Room Inventory", subtitle: "Floor maps, occupancy status & room configuration" },
  "/guests": { title: "Guest Directory", subtitle: "Active guests, booking histories and preferences" },
  "/wifi": { title: "Wi-Fi Management", subtitle: "Per-floor networks, captive portal & dynamic QR codes" },
  "/devices": { title: "Smart TV Fleet", subtitle: "Display hardware health, pairing & app versions" },
  "/staff": { title: "Team & Staff Access", subtitle: "Role-based permissions & front desk accounts" },
  "/reports": { title: "Hospitality Analytics", subtitle: "Occupancy trends, check-in metrics & length of stay" },
  "/settings": { title: "Hotel Preferences", subtitle: "Branding, amenities, quiet hours & TV appearance" },
};

export function Header({ onToggleMobileMenu }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, hotel, clearAuth } = useAuthStore();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const pageInfo =
    PAGE_TITLES[pathname] ||
    (pathname.startsWith("/rooms/")
      ? { title: "Room Details", subtitle: "Live status, guest and TV information" }
      : { title: "Dashboard", subtitle: "SmartStay TV Hospitality OS" });

  const handleLogout = () => {
    clearAuth();
    toast.success("Signed out successfully");
    router.push("/login");
  };

  const userInitials = user
    ? `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`.toUpperCase() || "AD"
    : "AD";

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 flex items-center justify-between sticky top-0 z-20">
      {/* Left: Mobile hamburger & Page Title */}
      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
        <button
          onClick={onToggleMobileMenu}
          className="lg:hidden p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight truncate">
            {pageInfo.title}
          </h1>
          {pageInfo.subtitle && (
            <p className="hidden md:block text-xs text-slate-500 font-medium truncate">
              {pageInfo.subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Right: Hotel Badge, Notifications, User Dropdown */}
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Hotel Name Badge */}
        <div className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200/80 text-xs font-semibold text-slate-700 shadow-2xs">
          <Building className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
          <span className="truncate max-w-[150px]">{hotel?.name || (user?.firstName ? `${user.firstName}'s Hotel` : "Hotel Property")}</span>
        </div>

        {/* Notifications Icon & Popover */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors relative"
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-indigo-600 ring-2 ring-white" />
          </button>

          {notificationsOpen && (
            <div className="absolute right-0 mt-2 w-80 rounded-2xl bg-white border border-slate-200 shadow-xl shadow-slate-200/50 py-3 z-50">
              <div className="px-4 pb-2 border-b border-slate-100 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900">Notifications</span>
                <span className="text-[11px] font-semibold text-indigo-600 cursor-pointer">
                  Mark all read
                </span>
              </div>
              <div className="py-2 px-3 divide-y divide-slate-100 text-xs">
                <div className="py-2.5 px-2 hover:bg-slate-50 rounded-lg transition-colors">
                  <div className="font-semibold text-slate-800">Room 101 Checked In</div>
                  <div className="text-slate-500 text-[11px] mt-0.5">
                    Guest TV greeting activated successfully • 2m ago
                  </div>
                </div>
                <div className="py-2.5 px-2 hover:bg-slate-50 rounded-lg transition-colors">
                  <div className="font-semibold text-slate-800">Room 203 TV Online</div>
                  <div className="text-slate-500 text-[11px] mt-0.5">
                    Living room display paired & connected • 14m ago
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* User Profile Avatar & Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
              {userInitials}
            </div>
            <span className="hidden md:inline-block text-xs font-semibold text-slate-700 max-w-[120px] truncate">
              {user?.firstName ? `${user.firstName} ${user.lastName || ""}` : "Hotel Staff"}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-white border border-slate-200 shadow-xl shadow-slate-200/50 py-2 z-50 animate-in fade-in-80">
              <div className="px-4 py-2 border-b border-slate-100">
                <p className="text-xs font-bold text-slate-900 truncate">
                  {user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email : "Staff Member"}
                </p>
                <p className="text-[11px] text-slate-500 truncate">{user?.email || "staff@hotel.com"}</p>
                <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700">
                  {user?.role || "OWNER"}
                </span>
              </div>

              <div className="py-1">
                <Link
                  href="/settings"
                  onClick={() => setDropdownOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                >
                  <Settings className="w-4 h-4 text-slate-400" />
                  <span>Hotel Settings</span>
                </Link>
                <Link
                  href="/tv-preview"
                  target="_blank"
                  onClick={() => setDropdownOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                >
                  <Sparkles className="w-4 h-4 text-indigo-500" />
                  <span>Launch TV Simulator</span>
                </Link>
              </div>

              <div className="pt-1 border-t border-slate-100">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

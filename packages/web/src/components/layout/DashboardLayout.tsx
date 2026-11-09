"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { useRealtimeSocket } from "@/hooks/useRealtimeSocket";
import { useNavigationStore } from "@/lib/navigation-store";
import { Tv } from "lucide-react";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const { isNavigating, targetPath, targetLabel, finishNavigation } = useNavigationStore();
  const [displayLoading, setDisplayLoading] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const prevPathRef = useRef(pathname);

  // Initialize singleton realtime WebSocket connection across all dashboard routes
  useRealtimeSocket();

  const handleOpenMobile = useCallback(() => setMobileMenuOpen(true), []);
  const handleCloseMobile = useCallback(() => setMobileMenuOpen(false), []);

  useEffect(() => {
    if (isNavigating) {
      setDisplayLoading(true);
      if (pathname === targetPath) {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          setDisplayLoading(false);
          finishNavigation();
        }, 220);
      }
    } else {
      setDisplayLoading(false);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isNavigating, targetPath, pathname, finishNavigation]);

  useEffect(() => {
    if (prevPathRef.current !== pathname) {
      prevPathRef.current = pathname;
      setDisplayLoading(true);
      const t = setTimeout(() => {
        setDisplayLoading(false);
        finishNavigation();
      }, 220);
      return () => clearTimeout(t);
    }
  }, [pathname, finishNavigation]);

  return (
    <div className="min-h-screen bg-[#F8F9FC] text-[#0F172A]">
      {/* Sidebar Navigation */}
      <Sidebar
        mobileOpen={mobileMenuOpen}
        onCloseMobile={handleCloseMobile}
      />

      {/* Main Content Area (Offset by desktop sidebar width 256px / w-64) */}
      <div className="lg:pl-64 flex flex-col min-h-screen">
        <Header onToggleMobileMenu={handleOpenMobile} />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto relative">
          {displayLoading ? (
            <div className="flex flex-col items-center justify-center min-h-[60vh] py-24 animate-in fade-in duration-150">
              <div className="relative flex items-center justify-center">
                <div className="absolute w-16 h-16 rounded-2xl bg-indigo-500/10 animate-ping" />
                <div className="w-14 h-14 rounded-2xl border-2 border-indigo-100 border-t-indigo-600 animate-spin bg-white shadow-md shadow-indigo-100 flex items-center justify-center" />
                <Tv className="w-6 h-6 text-indigo-600 absolute pointer-events-none" />
              </div>
              <p className="mt-5 text-sm font-bold text-slate-800 tracking-tight">
                Loading {targetLabel || "section"}...
              </p>
              <p className="text-xs text-slate-400 mt-1">Preparing live hotel screen data</p>
            </div>
          ) : (
            <div className="animate-in fade-in duration-200">
              {children}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default DashboardLayout;

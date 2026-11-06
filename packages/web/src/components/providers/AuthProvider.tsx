"use client";

import React, { useEffect, useState } from "react";
import { useAuthStore, setAuthCookie } from "@/lib/auth-store";
import { authApi } from "@/lib/api";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isInitializing, setIsInitializing] = useState(true);
  const pathname = usePathname();
  const { user, tokens, setUser, setHotel, clearAuth } = useAuthStore();

  useEffect(() => {
    async function initAuth() {
      const storedToken =
        tokens?.accessToken ||
        (typeof window !== "undefined"
          ? localStorage.getItem("smartstay_token")
          : null);

      if (storedToken) {
        // Sync cookie
        setAuthCookie(storedToken);

        // If user data is missing, hydrate from /auth/me
        if (!user) {
          try {
            const data = await authApi.getMe();
            if (data?.data?.user || data?.user) {
              const u = data?.data?.user || data?.user;
              const h = data?.data?.hotel || data?.hotel;
              setUser(u);
              if (h) setHotel(h);
            }
          } catch {
            // If token invalid, clear
            clearAuth();
          }
        }
      }
      setIsInitializing(false);
    }

    initAuth();
  }, []);

  const isPublicRoute =
    pathname?.startsWith("/login") ||
    pathname?.startsWith("/register") ||
    pathname?.startsWith("/tv-preview");

  // Show a minimal loader only on protected routes while checking initial stored credentials
  if (isInitializing && !isPublicRoute) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          <p className="text-sm font-medium text-slate-500 tracking-wide">
            Loading SmartStay...
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

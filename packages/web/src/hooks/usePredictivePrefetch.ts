"use client";

import { useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth-store";
import { prefetchRouteData } from "@/lib/prefetch";

/**
 * Hook to execute predictive prefetching across all sidebar sections.
 * Staggers background data & JS chunk preloading during idle intervals,
 * and provides instant on-hover prefetching for sidebar links.
 */
export function usePredictivePrefetch() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, tokens } = useAuthStore();

  const role = (user?.role || "STAFF").toUpperCase();
  const isOwnerOrAdmin = role === "OWNER" || role === "ADMIN" || role === "SUPER_ADMIN";
  const isManager = role === "MANAGER";

  // Immediate single-route prefetch (triggered on hover or focus)
  const prefetchSection = useCallback(
    (route: string) => {
      if (!tokens?.accessToken) return;

      // 1. Next.js router prefetch (pre-downloads JavaScript chunk & route RSC)
      try {
        router.prefetch(route);
      } catch {
        // Safe fallback
      }

      // 2. TanStack Query data prefetch (pre-downloads API data into client cache)
      prefetchRouteData(queryClient, route);
    },
    [router, queryClient, tokens?.accessToken]
  );

  useEffect(() => {
    if (!tokens?.accessToken) return;

    // Staggered background prefetching when idle
    const timers: NodeJS.Timeout[] = [];

    const schedule = (fn: () => void, delayMs: number) => {
      const t = setTimeout(() => {
        if (typeof window !== "undefined" && "requestIdleCallback" in window) {
          (window as any).requestIdleCallback(fn, { timeout: 2000 });
        } else {
          fn();
        }
      }, delayMs);
      timers.push(t);
    };

    // Wave 1 (300ms): Core operational sections
    schedule(() => {
      prefetchSection("/rooms");
      prefetchSection("/guests");
    }, 300);

    // Wave 2 (1200ms): Hardware & Connectivity sections
    schedule(() => {
      prefetchSection("/devices");
      if (isOwnerOrAdmin || isManager) {
        prefetchSection("/wifi");
      }
    }, 1200);

    // Wave 3 (2500ms): Analytics, Admin & Settings
    schedule(() => {
      if (isOwnerOrAdmin || isManager) {
        prefetchSection("/reports");
        prefetchSection("/settings");
      }
      if (isOwnerOrAdmin) {
        prefetchSection("/staff");
      }
    }, 2500);

    return () => {
      timers.forEach((t) => clearTimeout(t));
    };
  }, [tokens?.accessToken, isOwnerOrAdmin, isManager, prefetchSection]);

  return { prefetchSection };
}


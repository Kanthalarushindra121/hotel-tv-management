"use client";

import { QueryClient } from "@tanstack/react-query";
import {
  guestsApi,
  roomsApi,
  devicesApi,
  wifiApi,
  staffApi,
  dashboardApi,
  screensaverApi,
  hotelApi,
} from "./api";

// Set of routes that have already been prefetched to prevent duplicate calls
const prefetchedRoutes = new Set<string>();

/**
 * Prefetch TanStack Query data for a given route.
 * Ensures that when the user visits the route, the data is already in memory.
 */
export async function prefetchRouteData(queryClient: QueryClient, route: string) {
  if (prefetchedRoutes.has(route)) return;
  prefetchedRoutes.add(route);

  try {
    switch (route) {
      case "/":
        await Promise.allSettled([
          queryClient.prefetchQuery({
            queryKey: ["dashboard-stats"],
            queryFn: () => dashboardApi.getStats().catch(() => null),
            staleTime: 1000 * 60 * 5,
          }),
          queryClient.prefetchQuery({
            queryKey: ["rooms"],
            queryFn: () => roomsApi.getAll().catch(() => []),
            staleTime: 1000 * 60 * 5,
          }),
          queryClient.prefetchQuery({
            queryKey: ["dashboard-activity"],
            queryFn: () => dashboardApi.getActivity(10).catch(() => []),
            staleTime: 1000 * 60 * 5,
          }),
        ]);
        break;

      case "/rooms":
        await Promise.allSettled([
          queryClient.prefetchQuery({
            queryKey: ["rooms"],
            queryFn: () => roomsApi.getAll().catch(() => []),
            staleTime: 1000 * 60 * 5,
          }),
          queryClient.prefetchQuery({
            queryKey: ["available-devices"],
            queryFn: () => devicesApi.getAvailableDevices().catch(() => []),
            staleTime: 1000 * 60 * 5,
          }),
        ]);
        break;

      case "/guests":
        await queryClient.prefetchQuery({
          queryKey: ["guests"],
          queryFn: () => guestsApi.getAll().catch(() => []),
          staleTime: 1000 * 60 * 5,
        });
        break;

      case "/wifi":
        await queryClient.prefetchQuery({
          queryKey: ["wifi-zones"],
          queryFn: () => wifiApi.getAll().catch(() => []),
          staleTime: 1000 * 60 * 5,
        });
        break;

      case "/devices":
        await Promise.allSettled([
          queryClient.prefetchQuery({
            queryKey: ["devices"],
            queryFn: async () => {
              const res = await devicesApi.getAll().catch(() => []);
              return Array.isArray(res) ? res : (res as any)?.data || [];
            },
            staleTime: 1000 * 60 * 5,
          }),
          queryClient.prefetchQuery({
            queryKey: ["system-diagnostics"],
            queryFn: () => devicesApi.getDiagnostics().catch(() => null),
            staleTime: 1000 * 60 * 5,
          }),
          queryClient.prefetchQuery({
            queryKey: ["rooms"],
            queryFn: () => roomsApi.getAll().catch(() => []),
            staleTime: 1000 * 60 * 5,
          }),
        ]);
        break;

      case "/staff":
        await queryClient.prefetchQuery({
          queryKey: ["staff"],
          queryFn: () => staffApi.getAll().catch(() => []),
          staleTime: 1000 * 60 * 5,
        });
        break;

      case "/reports":
        await queryClient.prefetchQuery({
          queryKey: ["reports-stats", "7D"],
          queryFn: () => dashboardApi.getStats({ range: "7D" }).catch(() => null),
          staleTime: 1000 * 60 * 5,
        });
        break;

      case "/settings":
        await Promise.allSettled([
          queryClient.prefetchQuery({
            queryKey: ["screensaver-config"],
            queryFn: () => screensaverApi.get().catch(() => null),
            staleTime: 1000 * 60 * 5,
          }),
          queryClient.prefetchQuery({
            queryKey: ["hotel-profile"],
            queryFn: () => hotelApi.getProfile().catch(() => null),
            staleTime: 1000 * 60 * 5,
          }),
        ]);
        break;

      case "/tv-preview":
        await Promise.allSettled([
          queryClient.prefetchQuery({
            queryKey: ["hotel-profile"],
            queryFn: () => hotelApi.getProfile().catch(() => null),
            staleTime: 1000 * 60 * 5,
          }),
          queryClient.prefetchQuery({
            queryKey: ["rooms"],
            queryFn: () => roomsApi.getAll().catch(() => []),
            staleTime: 1000 * 60 * 5,
          }),
          queryClient.prefetchQuery({
            queryKey: ["wifi-zones"],
            queryFn: () => wifiApi.getAll().catch(() => []),
            staleTime: 1000 * 60 * 5,
          }),
        ]);
        break;

      default:
        break;
    }
  } catch {
    // If background prefetch fails, silently continue
  }
}

/**
 * Clear prefetch status for a specific route (or all) when mutated
 */
export function invalidateRoutePrefetch(route?: string) {
  if (route) {
    prefetchedRoutes.delete(route);
  } else {
    prefetchedRoutes.clear();
  }
}

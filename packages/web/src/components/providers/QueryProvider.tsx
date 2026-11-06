"use client";

import React, { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 5, // 5 min cache: instant sidebar transitions
            gcTime: 1000 * 60 * 30, // 30 min garbage collection retention
            refetchOnWindowFocus: false,
            refetchOnMount: false, // Serve immediate cache without blocking navigation
            retry: 1,
          },
        },
      })
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

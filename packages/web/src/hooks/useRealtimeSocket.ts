"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { io, Socket } from "socket.io-client";
import { useAuthStore } from "@/lib/auth-store";
import { API_BASE_URL } from "@/lib/api";

let globalSocket: Socket | null = null;
let connectionCount = 0;

export function useRealtimeSocket() {
  const queryClient = useQueryClient();
  const { tokens } = useAuthStore();
  const token = tokens?.accessToken;
  const tokenRef = useRef(token);
  tokenRef.current = token;

  useEffect(() => {
    if (!token) return;

    connectionCount++;

    const socketBase =
      process.env.NEXT_PUBLIC_SOCKET_URL ||
      API_BASE_URL.replace("/api/v1", "");

    if (!globalSocket) {
      globalSocket = io(socketBase, {
        auth: { token },
        transports: ["websocket", "polling"],
        reconnectionAttempts: 10,
        reconnectionDelay: 2000,
        timeout: 10000,
      });

      globalSocket.on("connect", () => {
        // Connected to realtime server
      });

      // Guest events
      globalSocket.on("GUEST_CHECKED_IN", () => {
        queryClient.invalidateQueries({ queryKey: ["rooms"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-activity"] });
        queryClient.invalidateQueries({ queryKey: ["guests"] });
      });

      globalSocket.on("GUEST_CHECKED_OUT", () => {
        queryClient.invalidateQueries({ queryKey: ["rooms"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-activity"] });
        queryClient.invalidateQueries({ queryKey: ["guests"] });
      });

      // Room status changes
      globalSocket.on("ROOM_STATUS_CHANGED", () => {
        queryClient.invalidateQueries({ queryKey: ["rooms"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      });

      // Device & TV fleet updates
      const onDeviceEvent = () => {
        queryClient.invalidateQueries({ queryKey: ["devices"] });
        queryClient.invalidateQueries({ queryKey: ["available-devices"] });
        queryClient.invalidateQueries({ queryKey: ["system-diagnostics"] });
        queryClient.invalidateQueries({ queryKey: ["rooms"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      };

      globalSocket.on("DEVICE_PAIRED", onDeviceEvent);
      globalSocket.on("DEVICE_UNPAIRED", onDeviceEvent);
      globalSocket.on("DEVICE_MOVED", onDeviceEvent);
      globalSocket.on("DEVICE_STATUS_CHANGED", onDeviceEvent);
      globalSocket.on("DEVICE_HEARTBEAT", onDeviceEvent);

      // Wi-Fi updates
      const onWifiEvent = () => {
        queryClient.invalidateQueries({ queryKey: ["wifi-zones"] });
        queryClient.invalidateQueries({ queryKey: ["hotel-profile"] });
      };

      globalSocket.on("WIFI_ZONE_UPDATED", onWifiEvent);
      globalSocket.on("WIFI_ZONE_CREATED", onWifiEvent);
    }

    return () => {
      connectionCount--;
      if (connectionCount <= 0 && globalSocket) {
        // Gentle debounce before closing to prevent teardown on rapid route switching
        setTimeout(() => {
          if (connectionCount <= 0 && globalSocket) {
            globalSocket.disconnect();
            globalSocket = null;
          }
        }, 5000);
      }
    };
  }, [token, queryClient]);

  return globalSocket;
}


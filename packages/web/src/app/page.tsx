"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { io, Socket } from "socket.io-client";
import {
  Tv,
  CheckCircle2,
  Users,
  DoorOpen,
  Calendar,
  Wifi,
  Sparkles,
  ArrowUpRight,
  Plus,
  RefreshCw,
  LogOut,
  QrCode,
  ExternalLink,
  ShieldCheck,
  Building2,
  Clock,
  Layers,
  Search,
  Filter,
  Check,
  X,
  Loader2,
  AlertCircle,
  Trash2,
  DoorClosed,
  Phone,
  Mail,
  User,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuthStore } from "@/lib/auth-store";
import { useHotelStore } from "@/lib/hotelStore";
import {
  roomsApi,
  dashboardApi,
  checkinsApi,
  hotelApi,
  RoomDTO,
  CheckInPayload,
  API_BASE_URL,
} from "@/lib/api";
import { QRCodeSVG } from "qrcode.react";

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const { tokens } = useAuthStore();
  const { hotelName, wifiNetwork, wifiPassword, wifiSecurity, getWifiQrString } =
    useHotelStore();

  // Filter & Search states
  const [filterFloor, setFilterFloor] = useState<number | "ALL">("ALL");
  const [filterStatus, setFilterStatus] = useState<
    "ALL" | "AVAILABLE" | "OCCUPIED" | "CLEANING" | "MAINTENANCE"
  >("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Modals state
  const [checkInModalOpen, setCheckInModalOpen] = useState(false);
  const [selectedRoomForCheckIn, setSelectedRoomForCheckIn] =
    useState<RoomDTO | null>(null);

  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [selectedRoomForCheckout, setSelectedRoomForCheckout] =
    useState<RoomDTO | null>(null);

  const [wifiModalOpen, setWifiModalOpen] = useState(false);

  // Form State for Check-in
  const [checkInForm, setCheckInForm] = useState<{
    guestName: string;
    phone: string;
    email: string;
    roomId: string;
    checkoutPolicy: "FIXED_11AM" | "HOURLY" | "CUSTOM";
    nights: number;
    hourlyHours: number;
    customCheckout: string;
    specialRequests: string;
  }>({
    guestName: "",
    phone: "",
    email: "",
    roomId: "",
    checkoutPolicy: "FIXED_11AM",
    nights: 1,
    hourlyHours: 6,
    customCheckout: "",
    specialRequests: "",
  });

  // =========================================================================
  // TANSTACK QUERIES
  // =========================================================================

  // 1. Dashboard Stats Query
  const {
    data: stats,
    isLoading: statsLoading,
    refetch: refetchStats,
  } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      try {
        return await dashboardApi.getStats();
      } catch {
        return null;
      }
    },
    placeholderData: (prev) => prev,
  });

  // Hotel Profile Query for dynamic standard checkout time
  const { data: hotelProfile } = useQuery({
    queryKey: ["hotel-profile"],
    queryFn: async () => {
      try {
        return await hotelApi.getProfile();
      } catch {
        return null;
      }
    },
    placeholderData: (prev) => prev,
  });

  const hotelStoreState = useHotelStore();
  const fixedCheckoutInfo = useMemo(() => {
    const raw = (hotelProfile?.settings?.checkOutTime || hotelStoreState.checkoutTime || "11:00").trim();
    let hours = 11;
    let minutes = 0;
    const match = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
    if (match) {
      hours = parseInt(match[1], 10);
      minutes = parseInt(match[2], 10);
      const period = match[3]?.toUpperCase();
      if (period === "PM" && hours < 12) hours += 12;
      if (period === "AM" && hours === 12) hours = 0;
    }
    const displayPeriod = hours >= 12 ? "PM" : "AM";
    const displayHour = hours % 12 === 0 ? 12 : hours % 12;
    const displayMin = minutes > 0 ? `:${minutes < 10 ? "0" : ""}${minutes}` : "";
    const label = `Fixed ${displayHour}${displayMin} ${displayPeriod}`;
    const formattedTime = `${displayHour}:${minutes < 10 ? "0" : ""}${minutes} ${displayPeriod}`;
    return { hours, minutes, label, formattedTime };
  }, [hotelProfile?.settings?.checkOutTime, hotelStoreState.checkoutTime]);

  // 2. Rooms Query
  const {
    data: roomsData,
    isLoading: roomsLoading,
    refetch: refetchRooms,
  } = useQuery({
    queryKey: ["rooms"],
    queryFn: async () => {
      try {
        const rooms = await roomsApi.getAll();
        return rooms;
      } catch {
        return [];
      }
    },
    placeholderData: (prev) => prev,
    refetchInterval: 10000,
  });

  // 3. Activity Query
  const {
    data: activityData,
    isLoading: activityLoading,
    refetch: refetchActivity,
  } = useQuery({
    queryKey: ["dashboard-activity"],
    queryFn: async () => {
      try {
        return await dashboardApi.getActivity(10);
      } catch {
        return [];
      }
    },
    placeholderData: (prev) => prev,
  });

  // Room Deletion State
  const [roomToDelete, setRoomToDelete] = useState<RoomDTO | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Fallback / seed rooms if backend hasn't populated any yet
  const rooms: RoomDTO[] = roomsData || [];

  // =========================================================================
  // REAL-TIME SOCKET.IO INTEGRATION
  // =========================================================================
  useEffect(() => {
    const socketBase =
      process.env.NEXT_PUBLIC_SOCKET_URL ||
      API_BASE_URL.replace("/api/v1", "");

    let socket: Socket | null = null;
    try {
      socket = io(socketBase, {
        auth: { token: tokens?.accessToken },
        transports: ["websocket", "polling"],
        reconnectionAttempts: 5,
      });

      socket.on("connect", () => {
        // Socket connected
      });

      socket.on("GUEST_CHECKED_IN", (payload: any) => {
        toast.info("Realtime Update", {
          description: `Guest checked in: ${payload?.guestName || "New check-in"}`,
        });
        queryClient.invalidateQueries({ queryKey: ["rooms"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-activity"] });
      });

      socket.on("GUEST_CHECKED_OUT", (payload: any) => {
        toast.info("Realtime Update", {
          description: `Guest checked out from Room ${payload?.roomNumber || ""}`,
        });
        queryClient.invalidateQueries({ queryKey: ["rooms"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-activity"] });
      });

      socket.on("ROOM_STATUS_CHANGED", () => {
        queryClient.invalidateQueries({ queryKey: ["rooms"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      });

      socket.on("device.heartbeat", () => {
        queryClient.invalidateQueries({ queryKey: ["rooms"] });
      });

      socket.on("device.status.updated", () => {
        queryClient.invalidateQueries({ queryKey: ["rooms"] });
      });

      socket.on("DEVICE_ONLINE", () => {
        queryClient.invalidateQueries({ queryKey: ["rooms"] });
      });

      socket.on("DEVICE_OFFLINE", () => {
        queryClient.invalidateQueries({ queryKey: ["rooms"] });
      });
    } catch {
      // Socket connection fallback
    }

    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [tokens?.accessToken, queryClient]);

  // =========================================================================
  // CHECK-IN MUTATION
  // =========================================================================
  const checkInMutation = useMutation({
    mutationFn: async (payload: CheckInPayload) => {
      return await checkinsApi.checkIn(payload);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-activity"] });
      toast.success("Guest Checked In Successfully!", {
        description: `${variables.guestName} has been assigned to Room. TV greeting activated.`,
      });
      setCheckInModalOpen(false);
      resetCheckInForm();
    },
    onError: (err: any) => {
      toast.error("Check-in Failed", {
        description: err.response?.data?.message || err.message || "Failed to process check-in.",
      });
    },
  });

  // =========================================================================
  // CHECK-OUT MUTATION
  // =========================================================================
  const checkOutMutation = useMutation({
    mutationFn: async (bookingOrRoomId: string) => {
      return await checkinsApi.checkOut(bookingOrRoomId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-activity"] });
      toast.success("Guest Checked Out", {
        description: "Room marked for cleaning and TV reset to default mode.",
      });
      setCheckoutModalOpen(false);
      setSelectedRoomForCheckout(null);
    },
    onError: (err: any) => {
      toast.error("Check-out Failed", {
        description: err.response?.data?.message || err.message || "Failed to process check-out.",
      });
    },
  });

  // =========================================================================
  // DELETE ROOM MUTATION
  // =========================================================================
  const deleteRoomMutation = useMutation({
    mutationFn: async (roomId: string) => {
      return await roomsApi.delete(roomId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success("Room Deleted", {
        description: `Room ${roomToDelete?.number} has been safely removed.`,
      });
      setDeleteConfirmOpen(false);
      setRoomToDelete(null);
    },
    onError: (err: any) => {
      toast.error("Failed to delete room", {
        description: err.response?.data?.message || err.message,
      });
    },
  });

  const handlePromptDeleteRoom = (room: RoomDTO) => {
    if (room.status?.toUpperCase() === "OCCUPIED") {
      toast.error("Cannot Delete Occupied Room", {
        description: `Room ${room.number} currently has an active guest stay. Please check out the guest first.`,
      });
      return;
    }
    setRoomToDelete(room);
    setDeleteConfirmOpen(true);
  };

  const resetCheckInForm = () => {
    setCheckInForm({
      guestName: "",
      phone: "",
      email: "",
      roomId: "",
      checkoutPolicy: "FIXED_11AM",
      nights: 1,
      hourlyHours: 6,
      customCheckout: "",
      specialRequests: "",
    });
    setSelectedRoomForCheckIn(null);
  };

  const handleOpenCheckIn = (room?: RoomDTO) => {
    if (room) {
      setSelectedRoomForCheckIn(room);
      setCheckInForm((prev) => ({ ...prev, roomId: room.id }));
    } else {
      const firstAvailable = rooms.find((r) => r.status.toUpperCase() === "AVAILABLE");
      if (firstAvailable) {
        setSelectedRoomForCheckIn(firstAvailable);
        setCheckInForm((prev) => ({ ...prev, roomId: firstAvailable.id }));
      }
    }
    setCheckInModalOpen(true);
  };

  const handleOpenCheckout = (room: RoomDTO) => {
    setSelectedRoomForCheckout(room);
    setCheckoutModalOpen(true);
  };

  // Memoized calculations for Stats
  const totalRoomsCount = useMemo(() => stats?.totalRooms ?? rooms.length, [stats?.totalRooms, rooms.length]);
  const occupiedCount = useMemo(
    () => stats?.occupiedRooms ?? rooms.filter((r) => r.status?.toUpperCase() === "OCCUPIED").length,
    [stats?.occupiedRooms, rooms]
  );
  const availableCount = useMemo(
    () => stats?.availableRooms ?? rooms.filter((r) => r.status?.toUpperCase() === "AVAILABLE").length,
    [stats?.availableRooms, rooms]
  );
  const occupancyRate = useMemo(
    () => stats?.occupancyRate ?? (totalRoomsCount > 0 ? Math.round((occupiedCount / totalRoomsCount) * 100) : 0),
    [stats?.occupancyRate, totalRoomsCount, occupiedCount]
  );
  const onlineTvs = useMemo(
    () => rooms.filter((r) => Boolean(r.device && (r.device.isOnline === true || r.device.status?.toUpperCase() === "ONLINE"))).length,
    [rooms]
  );

  // Memoized Filtered rooms
  const filteredRooms = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rooms.filter((room) => {
      if (filterFloor !== "ALL" && room.floor !== filterFloor) return false;
      if (filterStatus !== "ALL" && (room.status || "").toUpperCase() !== filterStatus) return false;
      if (q) {
        const numMatch = (room.number || room.roomNumber || "").toLowerCase().includes(q);
        const guestName = room.currentGuest
          ? `${room.currentGuest.firstName || ""} ${room.currentGuest.lastName || ""} ${room.currentGuest.name || ""}`.toLowerCase()
          : "";
        const guestMatch = guestName.includes(q);
        const typeMatch = (room.type || "").toLowerCase().includes(q);
        return numMatch || guestMatch || typeMatch;
      }
      return true;
    });
  }, [rooms, filterFloor, filterStatus, searchQuery]);

  // Memoized unique floors
  const floors = useMemo(() => {
    return Array.from(new Set(rooms.map((r) => r.floor))).sort((a, b) => a - b);
  }, [rooms]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Top Action Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Front Desk Operations</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Live room state, guest arrivals, and Smart TV screen orchestration
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => {
                refetchStats();
                refetchRooms();
                refetchActivity();
                toast.success("Synchronized with backend");
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
              <span>Refresh</span>
            </button>

            <button
              onClick={() => setWifiModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition-all"
            >
              <QrCode className="w-3.5 h-3.5 text-indigo-600" />
              <span>Wi-Fi QR</span>
            </button>

            <button
              onClick={() => handleOpenCheckIn()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold text-white shadow-sm shadow-indigo-200 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>New Check-In</span>
            </button>
          </div>
        </div>

        {/* Overview Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
          {/* Total Rooms */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Total Rooms</span>
              <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
                <Building2 className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900">{totalRoomsCount}</span>
              <span className="text-[11px] font-medium text-slate-400">Inventory</span>
            </div>
          </div>

          {/* Occupied */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Occupied</span>
              <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-indigo-600">{occupiedCount}</span>
              <span className="text-[11px] font-medium text-slate-400">Guests in stay</span>
            </div>
          </div>

          {/* Available */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Available</span>
              <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                <DoorOpen className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-emerald-600">{availableCount}</span>
              <span className="text-[11px] font-medium text-slate-400">Ready for check-in</span>
            </div>
          </div>

          {/* Occupancy Rate */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Occupancy</span>
              <div className="w-8 h-8 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
                <Layers className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900">{occupancyRate}%</span>
              <span className="text-[11px] font-medium text-emerald-600">Active</span>
            </div>
          </div>

          {/* Smart TVs Online */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Smart TVs</span>
              <div className="w-8 h-8 rounded-xl bg-sky-50 flex items-center justify-center text-sky-600">
                <Tv className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900">{onlineTvs}</span>
              <span className="text-[11px] font-medium text-slate-400">of {totalRoomsCount} online</span>
            </div>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search room number, guest name, or room type..."
                className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Status Filter */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
              {(["ALL", "AVAILABLE", "OCCUPIED", "CLEANING"] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                    filterStatus === status
                      ? "bg-white text-slate-900 shadow-2xs"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  {status === "ALL" ? "All Status" : status.charAt(0) + status.slice(1).toLowerCase()}
                </button>
              ))}
            </div>

            {/* Floor Filter */}
            <select
              value={filterFloor}
              onChange={(e) =>
                setFilterFloor(e.target.value === "ALL" ? "ALL" : Number(e.target.value))
              }
              className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            >
              <option value="ALL">All Floors</option>
              {floors.map((fl) => (
                <option key={fl} value={fl}>
                  Floor {fl}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Room Grid */}
        {roomsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div
                key={i}
                className="h-44 rounded-2xl bg-white border border-slate-200 p-5 animate-pulse flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="h-6 w-16 bg-slate-200 rounded" />
                  <div className="h-4 w-28 bg-slate-100 rounded" />
                </div>
                <div className="h-8 w-full bg-slate-100 rounded-xl" />
              </div>
            ))}
          </div>
        ) : filteredRooms.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-800">No rooms match your filter</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Try adjusting your search criteria or clear status filters to view the complete inventory.
            </p>
            <button
              onClick={() => {
                setFilterFloor("ALL");
                setFilterStatus("ALL");
                setSearchQuery("");
              }}
              className="mt-4 px-3 py-1.5 rounded-xl bg-slate-100 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition-colors"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredRooms.map((room) => {
              const isOccupied = room.status.toUpperCase() === "OCCUPIED";
              const isAvailable = room.status.toUpperCase() === "AVAILABLE";
              const isCleaning = room.status.toUpperCase() === "CLEANING";
              const isMaintenance = room.status.toUpperCase() === "MAINTENANCE";

              const guestName = room.currentGuest
                ? `${room.currentGuest.firstName || ""} ${room.currentGuest.lastName || ""}`.trim() ||
                  room.currentGuest.name ||
                  "Guest"
                : null;

              const tvOnline = Boolean(
                room.device &&
                (room.device.isOnline === true || room.device.status?.toUpperCase() === "ONLINE")
              );
              const tvDeviceName = room.device
                ? (room.device.name && room.device.name !== "Smart TV" && room.device.name !== "SmartStay Android TV"
                    ? room.device.name
                    : (room.device.deviceBrand && room.device.deviceModel
                        ? `${room.device.deviceBrand} ${room.device.deviceModel}`
                        : (room.device.deviceModel || room.device.name || "SmartStay TV")))
                : "No TV Assigned";

              return (
                <div
                  key={room.id}
                  className={`bg-white rounded-2xl border transition-all hover:shadow-md p-5 flex flex-col justify-between relative group ${
                    isOccupied
                      ? "border-indigo-200 hover:border-indigo-300 ring-1 ring-indigo-50"
                      : isAvailable
                      ? "border-emerald-200/80 hover:border-emerald-300"
                      : isCleaning
                      ? "border-amber-200 hover:border-amber-300"
                      : "border-slate-200"
                  }`}
                >
                  {/* Top: Room Number & Status Badge */}
                  <div>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xl md:text-2xl font-black tracking-tight text-slate-900">
                            Room {room.number || room.roomNumber}
                          </span>
                          <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                            Floor {room.floor}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500 font-medium block">
                          {room.type || "Standard Room"}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {/* Status Tag */}
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            isOccupied
                              ? "bg-indigo-50 text-indigo-700 border border-indigo-200/60"
                              : isAvailable
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                              : isCleaning
                              ? "bg-amber-50 text-amber-700 border border-amber-200/60"
                              : "bg-rose-50 text-rose-700 border border-rose-200/60"
                          }`}
                        >
                          {room.status}
                        </span>

                        {/* Room Delete Action */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePromptDeleteRoom(room);
                          }}
                          title="Delete Room"
                          className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Middle: Guest Info or TV Status */}
                    <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
                      {isOccupied && guestName ? (
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 text-slate-700 font-medium truncate">
                            <User className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                            <span className="truncate">{guestName}</span>
                          </div>
                          <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full shrink-0">
                            Active TV
                          </span>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400 italic">
                          {isAvailable ? "Ready for guest check-in" : "Turnaround in progress"}
                        </div>
                      )}

                      {/* Device TV connectivity */}
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <div className="flex items-center gap-1.5 truncate max-w-[65%]">
                          <Tv className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate font-medium text-slate-700" title={tvDeviceName}>
                            {tvDeviceName}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              tvOnline ? "bg-emerald-500 animate-pulse" : "bg-slate-300"
                            }`}
                          />
                          <span className={`font-semibold ${tvOnline ? "text-emerald-700" : "text-slate-600"}`}>
                            {tvOnline ? "Online" : "Offline"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Actions */}
                  <div className="mt-5 pt-3 border-t border-slate-100 flex items-center gap-2">
                    {isOccupied ? (
                      <button
                        onClick={() => handleOpenCheckout(room)}
                        className="flex-1 py-1.5 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Check Out</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleOpenCheckIn(room)}
                        className="flex-1 py-1.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition-colors flex items-center justify-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Check In</span>
                      </button>
                    )}

                    <Link
                      href={`/rooms/${room.id}`}
                      className="p-1.5 rounded-xl border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors"
                      title="View details"
                    >
                      <ArrowUpRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Live Event Stream / Activity Section */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-bold text-slate-900">Recent Front Desk & TV Events</h3>
            </div>
            <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              Live Feed
            </span>
          </div>

          <div className="space-y-3">
            {activityLoading ? (
              <div className="py-4 text-center text-xs text-slate-400">Loading activity...</div>
            ) : Array.isArray(activityData) && activityData.length > 0 ? (
              activityData.slice(0, 5).map((act: any, idx: number) => (
                <div
                  key={act.id || idx}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-50/70 border border-slate-100 text-xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                      <Tv className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800">
                        {act.description || act.title || "Guest TV personalized"}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Room {act.roomNumber || act.metadata?.roomNumber || "—"} • {act.guestName || "Guest"}
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {act.timestamp ? new Date(act.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Just now"}
                  </span>
                </div>
              ))
            ) : (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-500 flex items-center justify-between">
                <span>Room 101 TV activated: Welcome greeting displayed for Rahul Verma</span>
                <span className="text-[10px] text-slate-400">2 min ago</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* =========================================================================
          MODAL 1: CHECK-IN FLOW
          ========================================================================= */}
      {checkInModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 animate-in fade-in-90 zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900 tracking-tight">Guest Check-In</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Synchronizes room status and pushes personalized TV greetings immediately.
                </p>
              </div>
              <button
                onClick={() => setCheckInModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!checkInForm.guestName.trim()) {
                  toast.error("Please enter guest name");
                  return;
                }
                if (!checkInForm.roomId) {
                  toast.error("Please select a room");
                  return;
                }

                if (checkInForm.checkoutPolicy === "HOURLY") {
                  const hours = Math.max(1, checkInForm.hourlyHours || 6);
                  const calculatedOut = new Date(Date.now() + hours * 3600 * 1000).toISOString();
                  checkInMutation.mutate({
                    guestName: checkInForm.guestName,
                    phone: checkInForm.phone,
                    email: checkInForm.email,
                    roomId: checkInForm.roomId,
                    checkoutPolicy: "HOURLY",
                    stayType: "HOURLY",
                    nights: 1,
                    hours: hours,
                    checkOut: calculatedOut,
                    specialRequests: checkInForm.specialRequests,
                    forceCheckIn: true,
                  });
                } else if (checkInForm.checkoutPolicy === "CUSTOM") {
                  if (!checkInForm.customCheckout) {
                    toast.error("Please specify a custom checkout date & time");
                    return;
                  }
                  const customDate = new Date(checkInForm.customCheckout);
                  if (isNaN(customDate.getTime()) || customDate.getTime() <= Date.now()) {
                    toast.error("Custom checkout time must be in the future");
                    return;
                  }
                  checkInMutation.mutate({
                    guestName: checkInForm.guestName,
                    phone: checkInForm.phone,
                    email: checkInForm.email,
                    roomId: checkInForm.roomId,
                    checkoutPolicy: "CUSTOM",
                    stayType: "CUSTOM",
                    nights: Math.max(1, Math.round((customDate.getTime() - Date.now()) / (24 * 3600 * 1000))),
                    checkOut: customDate.toISOString(),
                    specialRequests: checkInForm.specialRequests,
                    forceCheckIn: true,
                  });
                } else {
                  // FIXED STAY (Respects hotel standard checkout time)
                  const targetCheckout = new Date();
                  targetCheckout.setDate(targetCheckout.getDate() + (checkInForm.nights || 1));
                  targetCheckout.setHours(fixedCheckoutInfo.hours, fixedCheckoutInfo.minutes, 0, 0);
                  checkInMutation.mutate({
                    guestName: checkInForm.guestName,
                    phone: checkInForm.phone,
                    email: checkInForm.email,
                    roomId: checkInForm.roomId,
                    checkoutPolicy: "FIXED",
                    stayType: "FIXED",
                    nights: checkInForm.nights || 1,
                    checkOut: targetCheckout.toISOString(),
                    specialRequests: checkInForm.specialRequests,
                    forceCheckIn: true,
                  });
                }
              }}
              className="mt-4 space-y-4"
            >
              {/* Room Selection */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Assign Room *
                </label>
                <select
                  value={checkInForm.roomId}
                  onChange={(e) => {
                    const sel = rooms.find((r) => r.id === e.target.value);
                    setSelectedRoomForCheckIn(sel || null);
                    setCheckInForm((prev) => ({ ...prev, roomId: e.target.value }));
                  }}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="">Select an available room</option>
                  {rooms
                    .filter((r) => (r.status || "").toUpperCase() !== "OCCUPIED")
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        Room {r.number || r.roomNumber} (Floor {r.floor}) • {r.type || "Standard Room"}
                      </option>
                    ))}
                </select>
              </div>

              {/* Guest Details */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Guest Full Name *
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. Vikram Sharma"
                    value={checkInForm.guestName}
                    onChange={(e) =>
                      setCheckInForm((prev) => ({ ...prev, guestName: e.target.value }))
                    }
                    className="w-full pl-9 pr-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                    Phone Number
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="tel"
                      placeholder="+91 98765 43210"
                      value={checkInForm.phone}
                      onChange={(e) =>
                        setCheckInForm((prev) => ({ ...prev, phone: e.target.value }))
                      }
                      className="w-full pl-9 pr-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="email"
                      placeholder="guest@example.com"
                      value={checkInForm.email}
                      onChange={(e) =>
                        setCheckInForm((prev) => ({ ...prev, email: e.target.value }))
                      }
                      className="w-full pl-9 pr-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>
                </div>
              </div>

              {/* Checkout Policy */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Checkout Policy & Duration
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "FIXED_11AM", label: fixedCheckoutInfo.label },
                    { id: "HOURLY", label: "Hourly Stay" },
                    { id: "CUSTOM", label: "Custom Time" },
                  ].map((pol) => (
                    <button
                      key={pol.id}
                      type="button"
                      onClick={() =>
                        setCheckInForm((prev) => ({
                          ...prev,
                          checkoutPolicy: pol.id as any,
                        }))
                      }
                      className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all text-center cursor-pointer ${
                        checkInForm.checkoutPolicy === pol.id
                          ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {pol.label}
                    </button>
                  ))}
                </div>
              </div>

              {checkInForm.checkoutPolicy === "FIXED_11AM" && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                    Number of Nights
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={checkInForm.nights}
                    onChange={(e) =>
                      setCheckInForm((prev) => ({
                        ...prev,
                        nights: parseInt(e.target.value) || 1,
                      }))
                    }
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                  <div className="text-[11px] text-indigo-700 font-medium bg-indigo-50/70 p-2 rounded-lg border border-indigo-100 mt-2 flex items-center justify-between">
                    <span>Checkout:</span>
                    <span className="font-bold">
                      {(() => {
                        const d = new Date();
                        d.setDate(d.getDate() + (checkInForm.nights || 1));
                        return `${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} at ${fixedCheckoutInfo.formattedTime}`;
                      })()}
                    </span>
                  </div>
                </div>
              )}

              {checkInForm.checkoutPolicy === "HOURLY" && (
                <div className="space-y-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700">
                      Stay Duration (Hours)
                    </label>
                    <span className="text-xs font-semibold text-indigo-600">
                      {checkInForm.hourlyHours} hours
                    </span>
                  </div>

                  {/* Preset quick chips */}
                  <div className="grid grid-cols-5 gap-1.5">
                    {[2, 3, 4, 6, 12].map((h) => (
                      <button
                        key={h}
                        type="button"
                        onClick={() => setCheckInForm((prev) => ({ ...prev, hourlyHours: h }))}
                        className={`py-1.5 text-xs font-semibold rounded-lg border transition cursor-pointer ${
                          checkInForm.hourlyHours === h
                            ? "bg-indigo-600 text-white border-indigo-600"
                            : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                        }`}
                      >
                        {h}h
                      </button>
                    ))}
                  </div>

                  {/* Custom hours input */}
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">
                      Or customize duration in hours:
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={72}
                      value={checkInForm.hourlyHours}
                      onChange={(e) =>
                        setCheckInForm((prev) => ({
                          ...prev,
                          hourlyHours: Math.max(1, parseInt(e.target.value) || 1),
                        }))
                      }
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>

                  {/* Calculated checkout live preview */}
                  <div className="text-[11px] text-indigo-700 font-medium bg-indigo-50/70 p-2 rounded-lg border border-indigo-100 flex items-center justify-between">
                    <span>Expected Checkout:</span>
                    <span className="font-bold">
                      {new Date(Date.now() + (checkInForm.hourlyHours || 6) * 3600 * 1000).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>
              )}

              {checkInForm.checkoutPolicy === "CUSTOM" && (
                <div className="space-y-2 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Custom Checkout Date &amp; Time
                  </label>
                  <input
                    type="datetime-local"
                    value={checkInForm.customCheckout}
                    onChange={(e) =>
                      setCheckInForm((prev) => ({
                        ...prev,
                        customCheckout: e.target.value,
                      }))
                    }
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                  <span className="text-[11px] text-slate-500 block">
                    Choose any future date and time for departure.
                  </span>
                </div>
              )}

              {/* Special Requests */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Special Requests / Welcome Note
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Extra pillows requested, anniversary stay."
                  value={checkInForm.specialRequests}
                  onChange={(e) =>
                    setCheckInForm((prev) => ({
                      ...prev,
                      specialRequests: e.target.value,
                    }))
                  }
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              {/* Submit / Cancel Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCheckInModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={checkInMutation.isPending}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md shadow-indigo-200 disabled:opacity-60"
                >
                  {checkInMutation.isPending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Checking In...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Confirm & Activate TV</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: CHECK-OUT CONFIRMATION
          ========================================================================= */}
      {checkoutModalOpen && selectedRoomForCheckout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 animate-in fade-in-90 zoom-in-95">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                <LogOut className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Confirm Guest Checkout</h3>
                <p className="text-xs text-slate-500">Room {selectedRoomForCheckout.number}</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs space-y-1.5 my-4">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Guest:</span>
                <span className="font-bold text-slate-900">
                  {selectedRoomForCheckout.currentGuest?.firstName || "Guest"}{" "}
                  {selectedRoomForCheckout.currentGuest?.lastName || ""}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Room Type:</span>
                <span className="text-slate-700">{selectedRoomForCheckout.type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">TV Action:</span>
                <span className="text-indigo-600 font-semibold">Resets to default screensaver</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Room Status:</span>
                <span className="text-amber-600 font-semibold">Transitions to CLEANING</span>
              </div>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Are you sure you want to finalize checkout for this room? The Smart TV screen will immediately clear guest personalized information.
            </p>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCheckoutModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={checkOutMutation.isPending}
                onClick={() => {
                  checkOutMutation.mutate(
                    selectedRoomForCheckout.currentBookingId || selectedRoomForCheckout.id
                  );
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-md shadow-rose-200 disabled:opacity-60"
              >
                {checkOutMutation.isPending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing Checkout...</span>
                  </>
                ) : (
                  <span>Complete Checkout</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 3: WI-FI QR CODE PREVIEW MODAL
          ========================================================================= */}
      {wifiModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-sm w-full p-6 text-center animate-in fade-in-90 zoom-in-95">
            <div className="flex justify-end">
              <button
                onClick={() => setWifiModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-3 shadow-xs">
              <Wifi className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-bold text-slate-900 tracking-tight">{hotelName}</h3>
            <p className="text-xs text-slate-500 mt-1">High Speed Guest Wi-Fi</p>

            <div className="my-6 p-4 rounded-2xl bg-slate-50 border border-slate-200 flex justify-center">
              <QRCodeSVG
                value={getWifiQrString()}
                size={180}
                level="M"
                includeMargin={false}
              />
            </div>

            <div className="text-xs space-y-1 text-slate-600 bg-slate-100/60 p-3 rounded-xl mb-4">
              <div className="flex justify-between">
                <span className="text-slate-400">Network (SSID):</span>
                <span className="font-bold text-slate-900">{wifiNetwork}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Security:</span>
                <span className="font-medium text-slate-700">{wifiSecurity}</span>
              </div>
            </div>

            <Link
              href="/wifi"
              onClick={() => setWifiModalOpen(false)}
              className="block w-full py-2.5 px-4 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors"
            >
              Manage Wi-Fi Zones & Passwords
            </Link>
          </div>
        </div>
      )}

      {/* =========================================================================
          ROOM DELETE CONFIRMATION MODAL
          ========================================================================= */}
      {deleteConfirmOpen && roomToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Delete Room {roomToDelete.number}?
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Are you sure you want to delete Room {roomToDelete.number} ({roomToDelete.type})? Any paired TV device will be unlinked. Historical guest stay records are safely preserved.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteConfirmOpen(false);
                  setRoomToDelete(null);
                }}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => deleteRoomMutation.mutate(roomToDelete.id)}
                disabled={deleteRoomMutation.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-xs font-semibold text-white shadow-xs cursor-pointer disabled:opacity-60"
              >
                {deleteRoomMutation.isPending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Room</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

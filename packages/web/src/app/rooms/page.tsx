"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BedDouble,
  Plus,
  Search,
  Filter,
  Tv,
  Users,
  CheckCircle2,
  Clock,
  Layers,
  Sparkles,
  ArrowRight,
  X,
  Loader2,
  Check,
  DoorOpen,
  Trash2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { roomsApi, devicesApi, RoomDTO } from "@/lib/api";

export default function RoomsPage() {
  const queryClient = useQueryClient();
  const [filterFloor, setFilterFloor] = useState<number | "ALL">("ALL");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [filterType, setFilterType] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [addModalOpen, setAddModalOpen] = useState(false);

  // Room Deletion State
  const [roomToDelete, setRoomToDelete] = useState<RoomDTO | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Form state for creating room
  const [newRoom, setNewRoom] = useState<{
    number: string;
    floor: number;
    type: string;
    capacity: number;
    status: string;
    notes: string;
  }>({
    number: "",
    floor: 1,
    type: "Deluxe Suite",
    capacity: 2,
    status: "AVAILABLE",
    notes: "",
  });

  // TV Pairing State inside Add Room Workflow
  const [pairingCodeInput, setPairingCodeInput] = useState("");
  const [isValidatingCode, setIsValidatingCode] = useState(false);
  const [validatedDevice, setValidatedDevice] = useState<{
    deviceId: string;
    hardwareId: string;
    model: string;
    brand: string;
    pairingCode: string;
    status: string;
  } | null>(null);
  const [pairingError, setPairingError] = useState<string | null>(null);

  const handleValidateCode = async () => {
    if (!pairingCodeInput.trim()) {
      toast.error("Please enter the 6-digit code shown on the TV");
      return;
    }
    setPairingError(null);
    setIsValidatingCode(true);
    try {
      const res = await devicesApi.validatePairingCode(pairingCodeInput.trim());
      setValidatedDevice(res);
      toast.success("TV Connected Successfully", {
        description: `Verified ${res.model || "Android TV"} (${res.hardwareId || ""})`,
      });
    } catch (err: any) {
      const msg =
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        "Invalid or expired pairing code";
      setPairingError(msg);
      toast.error("TV Connection Failed", { description: msg });
      setValidatedDevice(null);
    } finally {
      setIsValidatingCode(false);
    }
  };

  const { data: serverRooms, isLoading } = useQuery({
    queryKey: ["rooms"],
    queryFn: async () => {
      try {
        const data = await roomsApi.getAll();
        return data;
      } catch {
        return [];
      }
    },
  });

  const rooms: RoomDTO[] = serverRooms || [];

  const deleteRoomMutation = useMutation({
    mutationFn: async (roomId: string) => {
      return await roomsApi.delete(roomId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      toast.success("Room Deleted Successfully", {
        description: `Room ${roomToDelete?.number} has been removed from inventory.`,
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

  const disconnectTvMutation = useMutation({
    mutationFn: async (deviceId: string) => {
      return await devicesApi.unpair(deviceId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      toast.success("TV Disconnected", {
        description: "The TV device has been successfully unlinked from this room.",
      });
    },
    onError: (err: any) => {
      toast.error("Failed to disconnect TV", {
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

  const createRoomMutation = useMutation({
    mutationFn: async (data: any) => {
      return await roomsApi.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      toast.success("Room Created & TV Paired", {
        description: `Room ${newRoom.number} is ready${validatedDevice ? " and linked with Android TV" : ""}.`,
      });
      setAddModalOpen(false);
      setNewRoom({
        number: "",
        floor: 1,
        type: "Deluxe Suite",
        capacity: 2,
        status: "AVAILABLE",
        notes: "",
      });
      setPairingCodeInput("");
      setValidatedDevice(null);
      setPairingError(null);
    },
    onError: (err: any) => {
      toast.error("Failed to add room", {
        description: err.response?.data?.message || err.message,
      });
    },
  });

  // Extract unique room types and floors
  const floors = Array.from(new Set(rooms.map((r) => r.floor))).sort((a, b) => a - b);
  const roomTypes = Array.from(new Set(rooms.map((r) => r.type || "Standard")));

  // Filtered rooms
  const filteredRooms = rooms.filter((room) => {
    if (filterFloor !== "ALL" && room.floor !== filterFloor) return false;
    if (filterStatus !== "ALL" && room.status.toUpperCase() !== filterStatus) return false;
    if (filterType !== "ALL" && room.type !== filterType) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const numMatch = room.number.toLowerCase().includes(q);
      const guestName = room.currentGuest
        ? `${room.currentGuest.firstName || ""} ${room.currentGuest.lastName || ""}`.toLowerCase()
        : "";
      return numMatch || guestName.includes(q) || room.type?.toLowerCase().includes(q);
    }
    return true;
  });

  // Group rooms by floor
  const roomsByFloor = floors.reduce((acc, floorNum) => {
    const list = filteredRooms.filter((r) => r.floor === floorNum);
    if (list.length > 0) {
      acc[floorNum] = list;
    }
    return acc;
  }, {} as Record<number, RoomDTO[]>);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Room Inventory & Layout</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Browse room status by floor, manage guest occupants, and configure hardware associations.
            </p>
          </div>

          <button
            onClick={() => setAddModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold text-white shadow-sm shadow-indigo-200 transition-all self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Room</span>
          </button>
        </div>

        {/* Filter Bar */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by room #, guest, or type..."
              className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Status Filter */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
              {[
                { id: "ALL", label: "All Status" },
                { id: "AVAILABLE", label: "Available" },
                { id: "OCCUPIED", label: "Occupied" },
                { id: "CLEANING", label: "Cleaning" },
                { id: "MAINTENANCE", label: "Maintenance" },
              ].map((s) => (
                <button
                  key={s.id}
                  onClick={() => setFilterStatus(s.id)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                    filterStatus === s.id
                      ? "bg-white text-slate-900 shadow-2xs"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  {s.label}
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

            {/* Type Filter */}
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            >
              <option value="ALL">All Room Types</option>
              {roomTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Room Groups by Floor */}
        {isLoading ? (
          <div className="space-y-6">
            {[1, 2].map((f) => (
              <div key={f} className="space-y-3">
                <div className="h-6 w-32 bg-slate-200 rounded animate-pulse" />
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="h-36 rounded-2xl bg-white border border-slate-200 animate-pulse"
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : Object.keys(roomsByFloor).length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <DoorOpen className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-800">No rooms found</h3>
            <p className="text-xs text-slate-500 mt-1">
              No rooms match your active filters. Try resetting the criteria.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(roomsByFloor).map(([floorStr, floorRooms]) => {
              const floorNum = Number(floorStr);
              return (
                <div key={floorNum} className="space-y-3">
                  {/* Floor Header */}
                  <div className="flex items-center gap-2 pb-1 border-b border-slate-200/60">
                    <Layers className="w-4 h-4 text-indigo-600" />
                    <h3 className="text-sm font-bold text-slate-900">
                      Floor {floorNum}
                    </h3>
                    <span className="text-xs text-slate-500 font-medium">
                      ({floorRooms.length} {floorRooms.length === 1 ? "room" : "rooms"})
                    </span>
                  </div>

                  {/* Floor Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {floorRooms.map((room) => {
                      const isOccupied = room.status.toUpperCase() === "OCCUPIED";
                      const isAvailable = room.status.toUpperCase() === "AVAILABLE";
                      const isCleaning = room.status.toUpperCase() === "CLEANING";
                      const isMaintenance = room.status.toUpperCase() === "MAINTENANCE";

                      const guestName = room.currentGuest
                        ? `${room.currentGuest.firstName || ""} ${room.currentGuest.lastName || ""}`.trim() ||
                          room.currentGuest.name
                        : null;

                      const tvOnline = room.device?.status?.toUpperCase() === "ONLINE";

                      return (
                        <Link
                          key={room.id}
                          href={`/rooms/${room.id}`}
                          className={`bg-white rounded-2xl border p-5 transition-all hover:shadow-md flex flex-col justify-between group ${
                            isOccupied
                              ? "border-indigo-200/90 hover:border-indigo-400"
                              : isAvailable
                              ? "border-emerald-200/80 hover:border-emerald-400"
                              : isCleaning
                              ? "border-amber-200/80 hover:border-amber-400"
                              : "border-rose-200/80 hover:border-rose-400"
                          }`}
                        >
                          <div>
                            <div className="flex items-start justify-between">
                              <div>
                                <span className="text-2xl font-black text-slate-900 group-hover:text-indigo-600 transition-colors">
                                  {room.number}
                                </span>
                                <span className="block text-xs text-slate-500 font-medium">
                                  {room.type || "Room"}
                                </span>
                              </div>

                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                    isOccupied
                                      ? "bg-indigo-50 text-indigo-700"
                                      : isAvailable
                                      ? "bg-emerald-50 text-emerald-700"
                                      : isCleaning
                                      ? "bg-amber-50 text-amber-700"
                                      : "bg-rose-50 text-rose-700"
                                  }`}
                                >
                                  {room.status}
                                </span>

                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
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

                            <div className="mt-4 pt-3 border-t border-slate-100 text-xs">
                              {isOccupied && guestName ? (
                                <div className="text-slate-800 font-semibold truncate flex items-center gap-1.5">
                                  <Users className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                  <span className="truncate">{guestName}</span>
                                </div>
                              ) : (
                                <span className="text-slate-400 italic text-[11px]">
                                  {isAvailable ? "Vacant & inspected" : "Service requested"}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`w-2 h-2 rounded-full ${
                                  tvOnline ? "bg-emerald-500" : room.device ? "bg-slate-400" : "bg-slate-200"
                                }`}
                              />
                              <span>{room.device ? (tvOnline ? "TV Online" : "TV Offline") : "No TV"}</span>
                              {room.device && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (confirm(`Disconnect TV display from Room ${room.number}?`)) {
                                      disconnectTvMutation.mutate(room.device!.id);
                                    }
                                  }}
                                  title="Unlink TV from this room"
                                  className="ml-1 text-[10px] text-slate-400 hover:text-rose-600 hover:underline cursor-pointer"
                                >
                                  (Unlink)
                                </button>
                              )}
                            </div>

                            <div className="flex items-center gap-1 text-indigo-600 font-semibold group-hover:translate-x-0.5 transition-transform">
                              <span>Details</span>
                              <ArrowRight className="w-3 h-3" />
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal: Add Room */}
        {addModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 animate-in fade-in-90 zoom-in-95">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Add New Room</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Register a room number into your property inventory.
                  </p>
                </div>
                <button
                  onClick={() => setAddModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newRoom.number.trim()) {
                    toast.error("Please enter a room number");
                    return;
                  }
                  createRoomMutation.mutate({
                    number: newRoom.number,
                    floor: newRoom.floor,
                    type: newRoom.type,
                    capacity: newRoom.capacity,
                    status: newRoom.status,
                    notes: newRoom.notes,
                    pairingCode: validatedDevice ? pairingCodeInput.trim() : undefined,
                  });
                }}
                className="mt-4 space-y-4"
              >
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                      Room Number *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 301"
                      value={newRoom.number}
                      onChange={(e) => setNewRoom({ ...newRoom, number: e.target.value })}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                      Floor *
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={99}
                      required
                      value={newRoom.floor}
                      onChange={(e) =>
                        setNewRoom({ ...newRoom, floor: parseInt(e.target.value) || 1 })
                      }
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                      Room Type
                    </label>
                    <select
                      value={newRoom.type}
                      onChange={(e) => setNewRoom({ ...newRoom, type: e.target.value })}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    >
                      <option value="Deluxe Suite">Deluxe Suite</option>
                      <option value="Executive King">Executive King</option>
                      <option value="Standard Queen">Standard Queen</option>
                      <option value="Junior Suite">Junior Suite</option>
                      <option value="Presidential Suite">Presidential Suite</option>
                      <option value="Family Room">Family Room</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                      Capacity (Guests)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={newRoom.capacity}
                      onChange={(e) =>
                        setNewRoom({ ...newRoom, capacity: parseInt(e.target.value) || 2 })
                      }
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                    Initial Status
                  </label>
                  <select
                    value={newRoom.status}
                    onChange={(e) => setNewRoom({ ...newRoom, status: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  >
                    <option value="AVAILABLE">AVAILABLE (Ready)</option>
                    <option value="CLEANING">CLEANING (Housekeeping)</option>
                    <option value="MAINTENANCE">MAINTENANCE (Repair)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                    Notes / Location Description
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Corner room with beach view, balcony facing west."
                    value={newRoom.notes}
                    onChange={(e) => setNewRoom({ ...newRoom, notes: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                </div>

                {/* STEP 2: Physical Android TV Display Pairing */}
                <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Tv className="w-4 h-4 text-indigo-600" />
                      <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                        Smart TV Pairing (Step 2)
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-medium">Optional</span>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed">
                    Open SmartStay TV app on the room display and enter the 6-digit code shown on screen:
                  </p>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      maxLength={6}
                      value={pairingCodeInput}
                      onChange={(e) => {
                        setPairingCodeInput(e.target.value.toUpperCase());
                        if (validatedDevice) setValidatedDevice(null);
                        setPairingError(null);
                      }}
                      placeholder="e.g. 482193"
                      className="flex-1 px-3.5 py-2 text-sm font-mono tracking-widest uppercase rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    />
                    <button
                      type="button"
                      onClick={handleValidateCode}
                      disabled={isValidatingCode || !pairingCodeInput.trim()}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold text-white shadow-xs disabled:opacity-50 cursor-pointer flex items-center gap-1.5 shrink-0"
                    >
                      {isValidatingCode ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Connecting...</span>
                        </>
                      ) : (
                        <span>CONNECT</span>
                      )}
                    </button>
                  </div>

                  {pairingError && (
                    <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{pairingError}</span>
                    </div>
                  )}

                  {validatedDevice && (
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs space-y-1.5 animate-in fade-in">
                      <div className="flex items-center gap-1.5 font-bold text-emerald-700">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>TV Connected Successfully!</span>
                      </div>
                      <div className="text-[11px] text-emerald-700 flex flex-wrap justify-between gap-1 pt-1 border-t border-emerald-100">
                        <span>Model: <strong>{validatedDevice.model || "SmartStay Android TV"}</strong></span>
                        <span>Device ID: <strong className="font-mono">{validatedDevice.hardwareId || validatedDevice.deviceId}</strong></span>
                        <span className="font-semibold text-emerald-800">Status: Ready to link</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAddModalOpen(false);
                      setPairingCodeInput("");
                      setValidatedDevice(null);
                      setPairingError(null);
                    }}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={createRoomMutation.isPending}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md shadow-indigo-200 disabled:opacity-60 cursor-pointer"
                  >
                    {createRoomMutation.isPending ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving Room & TV...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>{validatedDevice ? "Save Room & Connect TV" : "Save Room"}</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        {/* Delete Room Confirmation Modal */}
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
      </div>
    </DashboardLayout>
  );
}

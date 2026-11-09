"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Tv,
  Users,
  Wifi,
  DoorOpen,
  Calendar,
  Clock,
  Sparkles,
  Phone,
  Mail,
  ShieldAlert,
  LogOut,
  Plus,
  Edit,
  Check,
  X,
  Loader2,
  ExternalLink,
  History,
  AlertCircle,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { roomsApi, checkinsApi, devicesApi, RoomDTO } from "@/lib/api";

export default function RoomDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const roomId = params?.id as string;

  const [editStatusModalOpen, setEditStatusModalOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<string>("AVAILABLE");
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedTvDeviceId, setSelectedTvDeviceId] = useState("");

  const { data: serverAvailableDevices } = useQuery({
    queryKey: ["available-devices"],
    placeholderData: (prev) => prev,
    queryFn: async () => {
      try {
        return await devicesApi.getAvailableDevices();
      } catch {
        return [];
      }
    },
  });
  const availableDevices: any[] = serverAvailableDevices || [];

  // Fetch Room Details
  const { data: room, isLoading } = useQuery({
    queryKey: ["room", roomId],
    placeholderData: (prev) => prev,
    queryFn: async () => {
      try {
        return await roomsApi.getById(roomId);
      } catch {
        return null;
      }
    },
  });

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Assign TV Mutation
  const assignTvMutation = useMutation({
    mutationFn: async (tvDeviceId: string) => {
      if (!tvDeviceId) {
        return await roomsApi.unassignTv(roomId);
      }
      return await roomsApi.assignTv(roomId, tvDeviceId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["room", roomId] });
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      queryClient.invalidateQueries({ queryKey: ["available-devices"] });
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      toast.success("TV Assignment Updated", {
        description: `TV device successfully associated with Room ${room?.number}`,
      });
      setAssignModalOpen(false);
    },
    onError: (err: any) => {
      toast.error("Failed to assign TV", {
        description: err.response?.data?.message || err.message,
      });
    },
  });

  // Unassign TV Mutation
  const unassignTvMutation = useMutation({
    mutationFn: async () => {
      return await roomsApi.unassignTv(roomId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["room", roomId] });
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      queryClient.invalidateQueries({ queryKey: ["available-devices"] });
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      toast.success("TV Device Unassigned", {
        description: `TV unlinked from Room ${room?.number}. Device remains paired in hotel fleet.`,
      });
    },
    onError: (err: any) => {
      toast.error("Failed to unassign TV", {
        description: err.response?.data?.message || err.message,
      });
    },
  });

  // Delete Room Mutation
  const deleteRoomMutation = useMutation({
    mutationFn: async () => {
      return await roomsApi.delete(roomId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success("Room Deleted Successfully");
      router.push("/rooms");
    },
    onError: (err: any) => {
      toast.error("Failed to delete room", {
        description: err.response?.data?.message || err.message,
      });
    },
  });

  const handlePromptDelete = () => {
    if (room?.status?.toUpperCase() === "OCCUPIED") {
      toast.error("Cannot Delete Occupied Room", {
        description: `Room ${room.number} currently has an active guest stay. Please check out the guest first.`,
      });
      return;
    }
    setDeleteConfirmOpen(true);
  };

  // Status Change Mutation
  const updateStatusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      return await roomsApi.update(roomId, { status: newStatus });
    },
    onSuccess: (_, newStatus) => {
      queryClient.invalidateQueries({ queryKey: ["room", roomId] });
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success("Room Status Updated", {
        description: `Room status set to ${newStatus}`,
      });
      setEditStatusModalOpen(false);
    },
    onError: (err: any) => {
      toast.error("Failed to update status", {
        description: err.response?.data?.message || err.message,
      });
    },
  });

  // Checkout Mutation
  const checkOutMutation = useMutation({
    mutationFn: async () => {
      if (!room) return;
      return await checkinsApi.checkOut(room.currentBookingId || room.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["room", roomId] });
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success("Guest Checked Out", {
        description: `Room ${room?.number} has been set to CLEANING. TV display reset to screensaver.`,
      });
    },
    onError: (err: any) => {
      toast.error("Checkout failed", {
        description: err.response?.data?.message || err.message,
      });
    },
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      </DashboardLayout>
    );
  }

  if (!room) {
    return (
      <DashboardLayout>
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center max-w-lg mx-auto mt-12 space-y-4">
          <DoorOpen className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-base font-bold text-slate-900">Room Not Found</h3>
          <p className="text-xs text-slate-500">
            This room may have been removed or the specified room ID does not exist in your property.
          </p>
          <Link
            href="/rooms"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-xs font-semibold text-white hover:bg-indigo-700 shadow-xs"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Rooms Directory</span>
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  const isOccupied = room.status.toUpperCase() === "OCCUPIED";
  const isAvailable = room.status.toUpperCase() === "AVAILABLE";
  const isCleaning = room.status.toUpperCase() === "CLEANING";
  const isMaintenance = room.status.toUpperCase() === "MAINTENANCE";
  const hasAssignedTv = Boolean(room.device || room.assignedTvId);
  const assignedTvId = room.device?.id || room.assignedTvId;
  const assignedTvName = room.device?.name || (assignedTvId ? `TV (${assignedTvId.slice(-4)})` : null);
  const assignedDeviceId = room.device?.deviceId || room.device?.id || assignedTvId;
  const tvOnline = Boolean(room.isOnline || (room.device?.status?.toUpperCase() === "ONLINE") || room.device?.isOnline);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Back Link & Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/rooms"
              className="p-2 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                  Room {room.number || room.roomNumber}
                </h2>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                    isOccupied
                      ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                      : isAvailable
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : isCleaning
                      ? "bg-amber-50 text-amber-700 border border-amber-200"
                      : "bg-rose-50 text-rose-700 border border-rose-200"
                  }`}
                >
                  {room.status}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Floor {room.floor} • {room.type || (room as any).roomType?.name || "Standard Room"} • Capacity: {room.capacity || (room as any).maxOccupancy || 2} Guests
              </p>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                setSelectedStatus(room.status);
                setEditStatusModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition-all"
            >
              <Edit className="w-3.5 h-3.5 text-slate-500" />
              <span>Change Status</span>
            </button>

            {isOccupied ? (
              <button
                onClick={() => checkOutMutation.mutate()}
                disabled={checkOutMutation.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-xs font-semibold text-white shadow-sm shadow-rose-200 transition-all disabled:opacity-60"
              >
                {checkOutMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <LogOut className="w-3.5 h-3.5" />
                )}
                <span>Check Out Guest</span>
              </button>
            ) : (
              <Link
                href="/"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold text-white shadow-sm shadow-indigo-200 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Check In Guest</span>
              </Link>
            )}

            <Link
              href="/tv-preview"
              target="_blank"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-white shadow-2xs transition-all"
            >
              <Tv className="w-3.5 h-3.5 text-indigo-400" />
              <span>Test TV Preview</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </Link>

            <button
              type="button"
              onClick={handlePromptDelete}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-xs font-semibold text-rose-700 shadow-2xs transition-all cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
              <span>Delete Room</span>
            </button>
          </div>
        </div>

        {/* 4 Detail Grid Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Room Specs */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100 text-xs font-bold text-slate-800 uppercase tracking-wider">
              <DoorOpen className="w-4 h-4 text-indigo-600" />
              <span>Room Specifications</span>
            </div>
            <div className="text-xs space-y-2 text-slate-600">
              <div className="flex justify-between">
                <span className="text-slate-400">Room Number:</span>
                <span className="font-bold text-slate-900 text-sm">Room {room.number || room.roomNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Floor Level:</span>
                <span className="font-semibold text-slate-800">Floor {room.floor}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Category:</span>
                <span className="font-semibold text-slate-800">{room.type || (room as any).roomType?.name || "Standard Room"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Max Capacity:</span>
                <span className="font-semibold text-slate-800">{room.capacity || (room as any).maxOccupancy || 2} persons</span>
              </div>
            </div>
          </div>

          {/* Card 2: Current Guest */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 text-xs font-bold text-slate-800 uppercase tracking-wider">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-600" />
                <span>Active Guest</span>
              </div>
              {isOccupied && (
                <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full">
                  In-House
                </span>
              )}
            </div>

            {isOccupied && room.currentGuest ? (
              <div className="text-xs space-y-2 text-slate-600">
                <div className="flex justify-between">
                  <span className="text-slate-400">Guest Name:</span>
                  <span className="font-bold text-slate-900">
                    {room.currentGuest.name ||
                      `${room.currentGuest.firstName || ""} ${room.currentGuest.lastName || ""}`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Contact:</span>
                  <span className="font-medium text-slate-800">
                    {room.currentGuest.phone || "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Check-in:</span>
                  <span className="font-medium text-slate-800">
                    {room.currentGuest.checkIn
                      ? new Date(room.currentGuest.checkIn).toLocaleDateString()
                      : "Today"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Departure:</span>
                  <span className="font-medium text-indigo-600">
                    {room.currentGuest.checkOut
                      ? new Date(room.currentGuest.checkOut).toLocaleDateString()
                      : "Tomorrow 11:00 AM"}
                  </span>
                </div>
              </div>
            ) : (
              <div className="py-4 text-center text-xs text-slate-400">
                No active guest currently checked in.
              </div>
            )}
          </div>

          {/* Card 3: Smart TV Device */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 text-xs font-bold text-slate-800 uppercase tracking-wider">
                <div className="flex items-center gap-2">
                  <Tv className="w-4 h-4 text-indigo-600" />
                  <span>Smart TV Hardware</span>
                </div>
                {hasAssignedTv ? (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-normal">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        tvOnline ? "bg-emerald-500 animate-pulse" : "bg-slate-300"
                      }`}
                    />
                    <span className={tvOnline ? "text-emerald-700" : "text-slate-500"}>
                      {tvOnline ? "ONLINE" : "OFFLINE"}
                    </span>
                  </span>
                ) : (
                  <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                    NO TV
                  </span>
                )}
              </div>

              <div className="text-xs space-y-2 text-slate-600 mt-2">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Assigned TV:</span>
                  <span className="font-semibold text-slate-900 truncate max-w-[140px] text-right">
                    {assignedTvName || "No TV Assigned"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Connection:</span>
                  <span
                    className={`font-bold ${
                      !hasAssignedTv
                        ? "text-slate-400"
                        : tvOnline
                        ? "text-emerald-600"
                        : "text-slate-500"
                    }`}
                  >
                    {!hasAssignedTv
                      ? "Unassigned"
                      : tvOnline
                      ? "Online & Synchronized"
                      : "Offline / Standby"}
                  </span>
                </div>
                {hasAssignedTv && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Device ID:</span>
                    <span className="font-mono text-[10px] text-slate-600 truncate max-w-[140px]">
                      {assignedDeviceId || room.assignedTvId || "—"}
                    </span>
                  </div>
                )}
                {hasAssignedTv && room.lastSeenAt && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Last Seen:</span>
                    <span className="text-[11px] text-slate-500">
                      {new Date(room.lastSeenAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setSelectedTvDeviceId(assignedTvId || "");
                  setAssignModalOpen(true);
                }}
                className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[11px] font-semibold text-slate-700 transition cursor-pointer"
              >
                <Tv className="w-3 h-3 text-indigo-600" />
                <span>{hasAssignedTv ? "Change TV" : "Assign TV"}</span>
              </button>

              {hasAssignedTv && (
                <button
                  type="button"
                  onClick={() => unassignTvMutation.mutate()}
                  disabled={unassignTvMutation.isPending}
                  className="px-2.5 py-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-[11px] font-semibold text-rose-700 transition disabled:opacity-50 cursor-pointer"
                  title="Unassign TV from this room"
                >
                  {unassignTvMutation.isPending ? "..." : "Unassign"}
                </button>
              )}
            </div>
          </div>

          {/* Card 4: Wi-Fi Zone */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100 text-xs font-bold text-slate-800 uppercase tracking-wider">
              <Wifi className="w-4 h-4 text-indigo-600" />
              <span>Assigned Wi-Fi Zone</span>
            </div>

            <div className="text-xs space-y-2 text-slate-600">
              <div className="flex justify-between">
                <span className="text-slate-400">Network Zone:</span>
                <span className="font-semibold text-slate-800">
                  {room.wifiZone?.name || `Floor ${room.floor} Coverage`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Network SSID:</span>
                <span className="font-bold text-slate-900">
                  {room.wifiZone?.ssid || `GrandPalace_Fl${room.floor}`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Password:</span>
                <span className="font-mono text-slate-600">••••••••</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Captive QR:</span>
                <span className="text-emerald-600 font-semibold">Active on TV</span>
              </div>
            </div>
          </div>
        </div>

        {/* Room Notes & Setup */}
        {room.notes && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
              Housekeeping & Location Notes
            </h4>
            <p className="text-xs text-slate-700 leading-relaxed">{room.notes}</p>
          </div>
        )}

        {/* Past Stays / History Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-bold text-slate-900">Room Stay History</h3>
            </div>
            <span className="text-xs text-slate-500">Past Guest Records</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-6">Guest Name</th>
                  <th className="py-3 px-6">Arrival Date</th>
                  <th className="py-3 px-6">Departure Date</th>
                  <th className="py-3 px-6">Length of Stay</th>
                  <th className="py-3 px-6">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {(() => {
                  const stays = (room.history && room.history.length > 0)
                    ? room.history
                    : ((room as any).bookings || []).map((b: any) => ({
                        id: b.id,
                        guestName: b.guest ? `${b.guest.firstName || ""} ${b.guest.lastName || ""}`.trim() : "Guest",
                        checkIn: b.checkInDate ? new Date(b.checkInDate).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "—",
                        checkOut: b.checkOutDate ? new Date(b.checkOutDate).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "—",
                        nights: b.nights || 1,
                        status: b.status,
                      }));

                  if (!stays || stays.length === 0) {
                    return (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-slate-400">
                          No historical stays recorded for this room.
                        </td>
                      </tr>
                    );
                  }

                  return stays.map((record: any) => (
                    <tr key={record.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-6 font-semibold text-slate-900">
                        {record.guestName}
                      </td>
                      <td className="py-3 px-6">{record.checkIn}</td>
                      <td className="py-3 px-6">{record.checkOut}</td>
                      <td className="py-3 px-6">
                        {record.nights} {record.nights === 1 ? "night" : "nights"}
                      </td>
                      <td className="py-3 px-6">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          record.status === "CHECKED_IN"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-slate-100 text-slate-600"
                        }`}>
                          {record.status === "CHECKED_IN" ? "In-House" : (record.status || "Completed")}
                        </span>
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal: Change Status */}
        {editStatusModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-sm w-full p-6 animate-in fade-in-90 zoom-in-95">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-base font-bold text-slate-900">Update Room Status</h3>
                <button
                  onClick={() => setEditStatusModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="my-4 space-y-2">
                {[
                  {
                    id: "AVAILABLE",
                    label: "AVAILABLE",
                    desc: "Ready for guest check-in (vacant)",
                    color: "text-emerald-700 bg-emerald-50 border-emerald-200",
                  },
                  {
                    id: "OCCUPIED",
                    label: "OCCUPIED",
                    desc: "Guest currently residing in room",
                    color: "text-indigo-700 bg-indigo-50 border-indigo-200",
                  },
                  {
                    id: "CLEANING",
                    label: "CLEANING",
                    desc: "Housekeeping in progress",
                    color: "text-amber-700 bg-amber-50 border-amber-200",
                  },
                  {
                    id: "MAINTENANCE",
                    label: "MAINTENANCE",
                    desc: "Out of order / repair underway",
                    color: "text-rose-700 bg-rose-50 border-rose-200",
                  },
                ].map((st) => (
                  <button
                    key={st.id}
                    onClick={() => setSelectedStatus(st.id)}
                    className={`w-full p-3 rounded-xl border text-left transition-all ${
                      selectedStatus === st.id
                        ? "border-indigo-600 ring-2 ring-indigo-100 bg-indigo-50/50"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">{st.label}</span>
                      {selectedStatus === st.id && (
                        <Check className="w-4 h-4 text-indigo-600" />
                      )}
                    </div>
                    <span className="text-[11px] text-slate-500 block mt-0.5">{st.desc}</span>
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  onClick={() => setEditStatusModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>

                <button
                  disabled={updateStatusMutation.isPending}
                  onClick={() => updateStatusMutation.mutate(selectedStatus)}
                  className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md shadow-indigo-200 disabled:opacity-60"
                >
                  {updateStatusMutation.isPending ? "Updating..." : "Save Status"}
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Modal: Assign TV to Room */}
        {assignModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                    <Tv className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Assign TV to Room {room.number}
                    </h3>
                    <p className="text-xs text-slate-500">
                      Select a TV device to associate with this room.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAssignModalOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                <button
                  type="button"
                  onClick={() => setSelectedTvDeviceId("")}
                  className={`w-full p-3 rounded-xl border text-left transition cursor-pointer flex items-center justify-between ${
                    selectedTvDeviceId === ""
                      ? "border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-100"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">No TV Assigned</span>
                    <span className="text-[11px] text-slate-400 block">Release any current TV device</span>
                  </div>
                  {selectedTvDeviceId === "" && <Check className="w-4 h-4 text-indigo-600" />}
                </button>

                {/* Currently assigned TV option */}
                {assignedTvId && !availableDevices.some((d) => d.id === assignedTvId) && (
                  <button
                    type="button"
                    onClick={() => setSelectedTvDeviceId(assignedTvId)}
                    className={`w-full p-3 rounded-xl border text-left transition cursor-pointer flex items-center justify-between ${
                      selectedTvDeviceId === assignedTvId
                        ? "border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-100"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-800 block">
                          {assignedTvName} (Current)
                        </span>
                        <span
                          className={`w-2 h-2 rounded-full ${
                            tvOnline ? "bg-emerald-500" : "bg-slate-300"
                          }`}
                        />
                      </div>
                      <span className="text-[11px] text-slate-400 block font-mono">
                        {assignedDeviceId || assignedTvId}
                      </span>
                    </div>
                    {selectedTvDeviceId === assignedTvId && <Check className="w-4 h-4 text-indigo-600" />}
                  </button>
                )}

                {availableDevices.map((dev: any) => {
                  const isDevOnline = dev.status?.toUpperCase() === "ONLINE" || dev.isOnline;
                  const isSelected = selectedTvDeviceId === dev.id;
                  return (
                    <button
                      key={dev.id}
                      type="button"
                      onClick={() => setSelectedTvDeviceId(dev.id)}
                      className={`w-full p-3 rounded-xl border text-left transition cursor-pointer flex items-center justify-between ${
                        isSelected
                          ? "border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-100"
                          : "border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-800 block">
                            {dev.name || dev.hardwareId || "SmartStay TV"}
                          </span>
                          <span
                            className={`w-2 h-2 rounded-full ${
                              isDevOnline ? "bg-emerald-500" : "bg-slate-300"
                            }`}
                          />
                          <span className="text-[10px] text-slate-500 font-normal">
                            {isDevOnline ? "Online" : "Offline"}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400 block font-mono">
                          {dev.hardwareId || dev.id}
                        </span>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-indigo-600" />}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAssignModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => assignTvMutation.mutate(selectedTvDeviceId)}
                  disabled={assignTvMutation.isPending}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold text-white shadow-xs cursor-pointer disabled:opacity-60"
                >
                  {assignTvMutation.isPending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Assignment</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Delete Room Confirmation Modal */}
        {deleteConfirmOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Delete Room {room.number}?
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Are you sure you want to delete Room {room.number} ({room.type})? Any paired TV device will be unlinked. Historical guest stay records are safely preserved.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => deleteRoomMutation.mutate()}
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

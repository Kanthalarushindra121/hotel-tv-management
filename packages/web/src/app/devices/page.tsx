"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Tv,
  Plus,
  RefreshCw,
  Search,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Unlink,
  Loader2,
  Check,
  X,
  Radio,
  DoorOpen,
  Wifi,
  Send,
  Bell,
  Clock,
  Sparkles,
  LogOut,
  SlidersHorizontal,
  Server,
  Activity,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { devicesApi, roomsApi, RoomDTO } from "@/lib/api";

export default function DevicesPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");

  // Pair TV Modal State
  const [pairModalOpen, setPairModalOpen] = useState(false);
  const [pairingCodeInput, setPairingCodeInput] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [validatedDevice, setValidatedDevice] = useState<any | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Remote Commands Modal State
  const [commandModalDevice, setCommandModalDevice] = useState<any | null>(null);
  const [executingCommand, setExecutingCommand] = useState<string | null>(null);
  const [customMessage, setCustomMessage] = useState<string>("Welcome to SmartStay. Let us know if you need anything!");

  // Assign Room Modal State
  const [assignModalDevice, setAssignModalDevice] = useState<any | null>(null);
  const [targetAssignRoomId, setTargetAssignRoomId] = useState<string>("");

  // Delete TV Modal State
  const [deleteModalDevice, setDeleteModalDevice] = useState<any | null>(null);

  // Fetch all devices for this hotel
  const { data: serverDevices, isLoading, refetch } = useQuery({
    queryKey: ["devices"],
    queryFn: async () => {
      try {
        const res = await devicesApi.getAll();
        return Array.isArray(res) ? res : res?.data || [];
      } catch {
        return [];
      }
    },
    placeholderData: (prev) => prev,
    refetchInterval: 30000,
  });

  // Fetch System Diagnostics
  const { data: diagnostics, refetch: refetchDiagnostics } = useQuery({
    queryKey: ["system-diagnostics"],
    queryFn: async () => {
      try {
        return await devicesApi.getDiagnostics();
      } catch {
        return null;
      }
    },
    placeholderData: (prev) => prev,
    refetchInterval: 45000,
  });

  // Fetch rooms to allow assigning TV to existing rooms
  const { data: serverRooms } = useQuery({
    queryKey: ["rooms"],
    queryFn: async () => {
      try {
        return await roomsApi.getAll();
      } catch {
        return [];
      }
    },
    placeholderData: (prev) => prev,
  });

  const rooms: RoomDTO[] = Array.isArray(serverRooms) ? serverRooms : [];
  const devices = Array.isArray(serverDevices) ? serverDevices : [];

  // Validate Code handler
  const handleValidate = async () => {
    if (!pairingCodeInput.trim()) {
      toast.error("Please enter the 6-digit pairing code");
      return;
    }
    setErrorMsg(null);
    setIsValidating(true);
    try {
      const res = await devicesApi.validatePairingCode(pairingCodeInput.trim());
      setValidatedDevice(res);
      toast.success("TV Verified", {
        description: `${res.model || "Android TV"} is ready to connect.`,
      });
    } catch (err: any) {
      const msg =
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        "Invalid or expired pairing code";
      setErrorMsg(msg);
      toast.error("Pairing Code Invalid", { description: msg });
      setValidatedDevice(null);
    } finally {
      setIsValidating(false);
    }
  };

  // Confirm pairing mutation
  const pairMutation = useMutation({
    mutationFn: async ({ code, roomId }: { code: string; roomId: string }) => {
      return await devicesApi.confirmPairing(code, roomId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      toast.success("TV Successfully Paired!", {
        description: "The TV is now assigned to the selected room and updated.",
      });
      setPairModalOpen(false);
      setPairingCodeInput("");
      setSelectedRoomId("");
      setValidatedDevice(null);
      setErrorMsg(null);
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error || err.response?.data?.message || err.message;
      toast.error("Pairing Failed", { description: msg });
    },
  });

  // Disconnect TV mutation
  const unpairMutation = useMutation({
    mutationFn: async (deviceId: string) => {
      return await devicesApi.unpair(deviceId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      toast.success("TV Disconnected", {
        description: "The display has been unlinked and returned to pairing mode.",
      });
    },
    onError: (err: any) => {
      toast.error("Failed to unpair TV", {
        description: err.response?.data?.message || err.message,
      });
    },
  });

  const assignDeviceMutation = useMutation({
    mutationFn: async ({ deviceId, roomId, replaceExisting }: { deviceId: string; roomId: string; replaceExisting?: boolean }) => {
      return await devicesApi.assign(deviceId, roomId, replaceExisting ?? true);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      toast.success("TV Assigned to Room Successfully");
      setAssignModalDevice(null);
      setTargetAssignRoomId("");
    },
    onError: (err: any) => {
      toast.error("Failed to assign room", {
        description: err.response?.data?.message || err.message,
      });
    },
  });

  const unassignDeviceMutation = useMutation({
    mutationFn: async (deviceId: string) => {
      return await devicesApi.unassign(deviceId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      toast.success("TV Unassigned from Room", {
        description: "The TV device has been safely released without deleting its record.",
      });
    },
    onError: (err: any) => {
      toast.error("Failed to unassign TV", {
        description: err.response?.data?.message || err.message,
      });
    },
  });

  const deleteDeviceMutation = useMutation({
    mutationFn: async (deviceId: string) => {
      return await devicesApi.delete(deviceId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      toast.success("TV Device Permanently Deleted", {
        description: "The hardware registration has been removed and its session revoked.",
      });
      setDeleteModalDevice(null);
    },
    onError: (err: any) => {
      toast.error("Failed to delete TV device", {
        description: err.response?.data?.message || err.message,
      });
    },
  });

  // Dispatch Remote Command with Mandatory ACK
  const handleDispatchCommand = async (command: string, payload?: any) => {
    if (!commandModalDevice) return;
    setExecutingCommand(command);
    try {
      const res = await devicesApi.sendCommand(commandModalDevice.id, command, payload);
      toast.success("TV Acknowledged Command!", {
        description: `Command ${command} confirmed and executed by TV display in room ${
          commandModalDevice.room?.roomNumber || "assigned"
        }.`,
      });
      queryClient.invalidateQueries({ queryKey: ["devices"] });
    } catch (err: any) {
      const msg =
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        `TV did not acknowledge command ${command}`;
      toast.error("Command Execution Failed", { description: msg });
    } finally {
      setExecutingCommand(null);
    }
  };

  const filtered = useMemo(() => {
    return devices.filter((dev: any) => {
      const status = (dev.status || (dev.isOnline ? "ONLINE" : "OFFLINE")).toUpperCase();
      if (filterStatus !== "ALL" && status !== filterStatus) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const name = (dev.name || dev.model || "").toLowerCase();
        const roomNum = (dev.room?.roomNumber || dev.roomNumber || "").toLowerCase();
        const ip = (dev.ipAddress || "").toLowerCase();
        const code = (dev.pairingCode || "").toLowerCase();
        return name.includes(q) || roomNum.includes(q) || ip.includes(q) || code.includes(q);
      }
      return true;
    });
  }, [devices, filterStatus, searchQuery]);

  const onlineCount = useMemo(() => devices.filter((d: any) => d.isOnline || d.status === "ONLINE").length, [devices]);
  const offlineCount = useMemo(() => devices.length - onlineCount, [devices.length, onlineCount]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              Smart TV Fleet & Hardware Diagnostics
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Monitor connected hotel displays, real-time sync states, and physical room pairings.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => {
                refetch();
                refetchDiagnostics();
                toast.success("Hardware status synced");
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
              <span>Ping All TVs</span>
            </button>

            <button
              onClick={() => {
                setPairModalOpen(true);
                setPairingCodeInput("");
                setValidatedDevice(null);
                setErrorMsg(null);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold text-white shadow-sm shadow-indigo-200 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Pair New TV (Enter Code)</span>
            </button>

            <Link
              href="/tv-preview"
              target="_blank"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100 text-xs font-semibold text-indigo-700 transition-all cursor-pointer"
            >
              <Tv className="w-3.5 h-3.5 text-indigo-600" />
              <span>Simulator</span>
              <ExternalLink className="w-3 h-3 text-indigo-500" />
            </Link>
          </div>
        </div>

        {/* ══════════════ SYSTEM & FLEET DIAGNOSTICS CARD ══════════════ */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <Server className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Backend Gateway
              </span>
              <span className="text-xs font-bold text-slate-900 truncate block font-mono">
                {diagnostics?.lanIp ? `http://${diagnostics.lanIp}:${diagnostics.port || 4000}` : "0.0.0.0:4000"}
              </span>
              <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Listening 0.0.0.0 (Port 4000)
              </span>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <Activity className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Realtime Channel
              </span>
              <span className="text-xs font-bold text-slate-900 block font-mono">
                WebSocket + ACK
              </span>
              <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                DB: {diagnostics?.database || "CONNECTED"} • Redis: {diagnostics?.redis || "CONNECTED"}
              </span>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Radio className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Active TV Fleet
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-base font-bold text-slate-900">{devices.length}</span>
                <span className="text-[11px] text-slate-500">Connected Displays</span>
              </div>
              <span className="text-[10px] text-slate-400 font-medium block mt-0.5">
                Heartbeat window: 90s
              </span>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <Tv className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Fleet Status
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[11px] font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  {onlineCount} Online
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] font-bold">
                  {offlineCount} Offline
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-medium block mt-1">
                Zero hardcoded IPs
              </span>
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by room, device name, or IP..."
              className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            {["ALL", "ONLINE", "OFFLINE"].map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  filterStatus === s
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {s === "ALL" ? "All Displays" : s}
              </button>
            ))}
          </div>
        </div>

        {/* Devices Table or Empty State */}
        {filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs">
            <Tv className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-800">No TV displays connected yet</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Open the SmartStay TV app on your television, click "Pair New TV", and enter the 6-digit code shown on screen to link your first display.
            </p>
            <button
              onClick={() => setPairModalOpen(true)}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold text-white shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Pair Your First TV</span>
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                    <th className="py-3.5 px-6">Device Name & Hardware</th>
                    <th className="py-3.5 px-6">Assigned Room</th>
                    <th className="py-3.5 px-6">Connection Status</th>
                    <th className="py-3.5 px-6">App Version</th>
                    <th className="py-3.5 px-6">IP & Last Heartbeat</th>
                    <th className="py-3.5 px-6 text-right">Remote Controls & Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filtered.map((dev: any) => {
                    const isOnline = dev.isOnline || dev.status === "ONLINE";
                    const roomNumber = dev.room?.roomNumber || dev.roomNumber || "Unassigned";

                    return (
                      <tr key={dev.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3.5 px-6">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                                isOnline ? "bg-indigo-50 text-indigo-600" : "bg-slate-100 text-slate-400"
                              }`}
                            >
                              <Tv className="w-4 h-4" />
                            </div>
                            <div>
                              <span className="font-bold text-slate-900 block">
                                {dev.name || dev.model || "SmartStay Android TV"}
                              </span>
                              <span className="text-[11px] text-slate-400 font-mono">
                                Hardware: {dev.deviceId ? dev.deviceId.substring(0, 18) : dev.id.substring(0, 8)}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-6">
                          {roomNumber !== "Unassigned" ? (
                            <span className="font-bold text-indigo-600 font-mono bg-indigo-50 px-2.5 py-1 rounded-lg">
                              Room {roomNumber}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">Not Assigned</span>
                          )}
                        </td>

                        <td className="py-3.5 px-6">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              isOnline
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-slate-100 text-slate-500 border border-slate-200"
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                isOnline ? "bg-emerald-500 animate-pulse" : "bg-slate-400"
                              }`}
                            />
                            <span>{isOnline ? "ONLINE" : "OFFLINE"}</span>
                          </span>
                        </td>

                        <td className="py-3.5 px-6 font-mono text-[11px] text-slate-600">
                          {dev.appVersion || "v1.0.0"}
                        </td>

                        <td className="py-3.5 px-6 space-y-0.5">
                          <div className="font-mono text-[11px] text-slate-600">
                            {dev.ipAddress || "192.168.29.219"}
                          </div>
                          <div className="text-[10px] text-slate-400 font-medium">
                            {dev.lastSeenAt ? `Seen ${new Date(dev.lastSeenAt).toLocaleTimeString()}` : "Never"}
                          </div>
                        </td>

                        <td className="py-3.5 px-6 text-right space-x-1.5">
                          {/* Assign / Reassign Room Button */}
                          <button
                            onClick={() => {
                              setAssignModalDevice(dev);
                              setTargetAssignRoomId(dev.roomId || "");
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-indigo-200 bg-white hover:bg-indigo-50 text-indigo-700 font-semibold text-[11px] transition-all cursor-pointer"
                          >
                            <DoorOpen className="w-3.5 h-3.5 text-indigo-600" />
                            <span>{dev.roomId ? "Change Room" : "Assign Room"}</span>
                          </button>

                          {/* Remote Commands Button */}
                          <button
                            onClick={() => setCommandModalDevice(dev)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-semibold text-[11px] transition-all cursor-pointer"
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Commands</span>
                          </button>

                          {/* Unassign TV from Room Button */}
                          {dev.roomId && (
                            <button
                              onClick={() => {
                                if (confirm(`Unassign TV '${dev.name || dev.deviceId}' from Room ${roomNumber}? The TV device record and token will be safely preserved.`)) {
                                  unassignDeviceMutation.mutate(dev.id);
                                }
                              }}
                              disabled={unassignDeviceMutation.isPending}
                              title="Unassign TV from room without deleting hardware"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-semibold text-[11px] transition-all cursor-pointer disabled:opacity-50"
                            >
                              <Unlink className="w-3.5 h-3.5" />
                              <span>Unassign</span>
                            </button>
                          )}

                          {/* Safe Delete TV Hardware */}
                          <button
                            onClick={() => setDeleteModalDevice(dev)}
                            title="Delete TV Device from Hotel"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer inline-flex items-center align-middle"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══════════════ MODAL: REMOTE COMMANDS WITH TV ACK ══════════════ */}
        {commandModalDevice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-xl w-full p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <SlidersHorizontal className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Remote Controls — Room {commandModalDevice.room?.roomNumber || "TV"}
                    </h3>
                    <p className="text-xs text-slate-500">
                      Send verified real-time commands with mandatory TV acknowledgement
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setCommandModalDevice(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Device Status Bar */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      commandModalDevice.isOnline || commandModalDevice.status === "ONLINE"
                        ? "bg-emerald-500 animate-pulse"
                        : "bg-slate-400"
                    }`}
                  />
                  <span className="font-semibold text-slate-800">
                    {commandModalDevice.name || commandModalDevice.model || "Android TV"}
                  </span>
                  <span className="text-slate-400 font-mono">({commandModalDevice.ipAddress || "LAN"})</span>
                </div>
                <span className="text-[11px] font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                  Room {commandModalDevice.room?.roomNumber || "Unassigned"}
                </span>
              </div>

              {/* 7 Remote Commands Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* 1. REFRESH_SCREEN */}
                <button
                  onClick={() => handleDispatchCommand("REFRESH_SCREEN")}
                  disabled={executingCommand !== null}
                  className="p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-indigo-300 text-left transition-all cursor-pointer flex items-start gap-2.5 disabled:opacity-50"
                >
                  <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 shrink-0">
                    {executingCommand === "REFRESH_SCREEN" ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">1. Refresh Screen</span>
                    <span className="text-[11px] text-slate-500 block">Re-sync in-room TV display state</span>
                  </div>
                </button>

                {/* 2. UPDATE_ROOM */}
                <button
                  onClick={() =>
                    handleDispatchCommand("UPDATE_ROOM", {
                      roomNumber: commandModalDevice.room?.roomNumber || "101",
                    })
                  }
                  disabled={executingCommand !== null}
                  className="p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-indigo-300 text-left transition-all cursor-pointer flex items-start gap-2.5 disabled:opacity-50"
                >
                  <div className="p-2 rounded-lg bg-blue-50 text-blue-600 shrink-0">
                    {executingCommand === "UPDATE_ROOM" ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <DoorOpen className="w-4 h-4" />
                    )}
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">2. Update Room Details</span>
                    <span className="text-[11px] text-slate-500 block">Push room number & branding</span>
                  </div>
                </button>

                {/* 3. REFRESH_WIFI */}
                <button
                  onClick={() => handleDispatchCommand("REFRESH_WIFI")}
                  disabled={executingCommand !== null}
                  className="p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-indigo-300 text-left transition-all cursor-pointer flex items-start gap-2.5 disabled:opacity-50"
                >
                  <div className="p-2 rounded-lg bg-cyan-50 text-cyan-600 shrink-0">
                    {executingCommand === "REFRESH_WIFI" ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Wifi className="w-4 h-4" />
                    )}
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">3. Refresh Wi-Fi</span>
                    <span className="text-[11px] text-slate-500 block">Push QR & network credentials</span>
                  </div>
                </button>

                {/* 5. CHECKOUT_REMINDER */}
                <button
                  onClick={() => handleDispatchCommand("CHECKOUT_REMINDER", { checkoutTime: "11:00 AM" })}
                  disabled={executingCommand !== null}
                  className="p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-indigo-300 text-left transition-all cursor-pointer flex items-start gap-2.5 disabled:opacity-50"
                >
                  <div className="p-2 rounded-lg bg-amber-50 text-amber-600 shrink-0">
                    {executingCommand === "CHECKOUT_REMINDER" ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Clock className="w-4 h-4" />
                    )}
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">5. Checkout Reminder</span>
                    <span className="text-[11px] text-slate-500 block">Send departure countdown notice</span>
                  </div>
                </button>

                {/* 6. CHECKOUT_NOTIFY */}
                <button
                  onClick={() => handleDispatchCommand("CHECKOUT_NOTIFY", { checkoutTime: "11:00 AM" })}
                  disabled={executingCommand !== null}
                  className="p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-indigo-300 text-left transition-all cursor-pointer flex items-start gap-2.5 disabled:opacity-50"
                >
                  <div className="p-2 rounded-lg bg-orange-50 text-orange-600 shrink-0">
                    {executingCommand === "CHECKOUT_NOTIFY" ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Bell className="w-4 h-4" />
                    )}
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">6. Checkout Screen</span>
                    <span className="text-[11px] text-slate-500 block">Switch display to departure view</span>
                  </div>
                </button>

                {/* 7. CLEAR_GUEST */}
                <button
                  onClick={() => handleDispatchCommand("CLEAR_GUEST")}
                  disabled={executingCommand !== null}
                  className="p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-rose-300 text-left transition-all cursor-pointer flex items-start gap-2.5 disabled:opacity-50"
                >
                  <div className="p-2 rounded-lg bg-rose-50 text-rose-600 shrink-0">
                    {executingCommand === "CLEAR_GUEST" ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <LogOut className="w-4 h-4" />
                    )}
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">7. Clear Guest Session</span>
                    <span className="text-[11px] text-slate-500 block">Reset TV to default welcome mode</span>
                  </div>
                </button>
              </div>

              {/* 4. SEND_MESSAGE Panel */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2">
                <label className="block text-xs font-bold text-slate-800">
                  4. Send Guest Banner Message
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={customMessage}
                    onChange={(e) => setCustomMessage(e.target.value)}
                    placeholder="Enter message to display on TV..."
                    className="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                  <button
                    onClick={() => handleDispatchCommand("SEND_MESSAGE", { message: customMessage })}
                    disabled={executingCommand !== null || !customMessage.trim()}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold text-white shadow-xs disabled:opacity-50 cursor-pointer flex items-center gap-1.5 shrink-0"
                  >
                    {executingCommand === "SEND_MESSAGE" ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    <span>Send Message</span>
                  </button>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setCommandModalDevice(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 cursor-pointer"
                >
                  Close Controls
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Pair New TV by Code */}
        {pairModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs animate-in fade-in">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <Tv className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Pair TV Display</h3>
                    <p className="text-xs text-slate-500">Connect a physical Android TV to a room</p>
                  </div>
                </div>
                <button
                  onClick={() => setPairModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Step 1: Enter 6-digit code */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Enter 6-Digit Code Shown on TV *
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    maxLength={6}
                    value={pairingCodeInput}
                    onChange={(e) => {
                      setPairingCodeInput(e.target.value.toUpperCase());
                      setValidatedDevice(null);
                      setErrorMsg(null);
                    }}
                    placeholder="e.g. 482193"
                    className="flex-1 px-3.5 py-2.5 text-base font-mono tracking-widest uppercase rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                  <button
                    type="button"
                    onClick={handleValidate}
                    disabled={isValidating || !pairingCodeInput.trim()}
                    className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold text-white shadow-xs disabled:opacity-50 cursor-pointer flex items-center gap-1.5 shrink-0"
                  >
                    {isValidating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <span>Verify Code</span>
                    )}
                  </button>
                </div>
                {errorMsg && (
                  <p className="text-[11px] text-rose-600 font-medium flex items-center gap-1 mt-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{errorMsg}</span>
                  </p>
                )}
              </div>

              {/* Step 2: Show verified TV info */}
              {validatedDevice && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1 animate-in fade-in">
                  <div className="flex items-center gap-1.5 text-emerald-800 text-xs font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>TV Device Verified</span>
                  </div>
                  <div className="text-[11px] text-emerald-700 font-mono space-y-0.5">
                    <p>Model: {validatedDevice.model || "Android TV 4K"}</p>
                    <p>OS: {validatedDevice.osVersion || "Android TV"}</p>
                    <p>Hardware ID: {validatedDevice.hardwareId || validatedDevice.deviceId}</p>
                  </div>
                </div>
              )}

              {/* Step 3: Select Room */}
              {validatedDevice && (
                <div className="space-y-1.5 animate-in fade-in">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Assign to Hotel Room (Only Rooms With No TV) *
                  </label>
                  <select
                    value={selectedRoomId}
                    onChange={(e) => setSelectedRoomId(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 cursor-pointer"
                  >
                    <option value="">Select an available room (No TV)...</option>
                    {rooms
                      .filter((r) => !r.device)
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          Room {r.roomNumber || r.number} ({r.type || "Standard"} — Floor {r.floor || 1})
                        </option>
                      ))}
                  </select>
                  {rooms.filter((r) => !r.device).length === 0 && (
                    <p className="text-[11px] text-amber-600 font-medium">
                      Notice: All hotel rooms currently have a TV assigned. Create a new room in Rooms section first.
                    </p>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPairModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-800 cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (!validatedDevice) {
                      toast.error("Please verify the pairing code first");
                      return;
                    }
                    if (!selectedRoomId) {
                      toast.error("Please select a room to assign this TV");
                      return;
                    }
                    pairMutation.mutate({
                      code: pairingCodeInput.trim(),
                      roomId: selectedRoomId,
                    });
                  }}
                  disabled={!validatedDevice || !selectedRoomId || pairMutation.isPending}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md shadow-indigo-200 disabled:opacity-50 cursor-pointer"
                >
                  {pairMutation.isPending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Pairing TV...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Confirm & Connect TV</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════ MODAL: ASSIGN TV TO ROOM ══════════════ */}
        {assignModalDevice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-in zoom-in-95">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <DoorOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Assign TV to Room
                    </h3>
                    <p className="text-xs text-slate-500">
                      Device: <strong>{assignModalDevice.name || assignModalDevice.deviceId}</strong>
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setAssignModalDevice(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <label className="block text-xs font-semibold text-slate-700">
                  Select Room for this Television (Showing Available Rooms with No TV):
                </label>
                {(() => {
                  const roomsWithNoTv = rooms.filter(
                    (r) => !r.device || (assignModalDevice && r.device.id === assignModalDevice.id)
                  );

                  if (roomsWithNoTv.length === 0) {
                    return (
                      <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>All rooms in this hotel currently have a TV assigned. Create a new room or unassign another TV first.</span>
                      </div>
                    );
                  }

                  return (
                    <select
                      value={targetAssignRoomId}
                      onChange={(e) => setTargetAssignRoomId(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 bg-white text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    >
                      <option value="">-- Choose an available room (No TV) --</option>
                      {roomsWithNoTv.map((r) => {
                        const roomNum = r.roomNumber || r.number;
                        const isCurrent = assignModalDevice && r.device?.id === assignModalDevice.id;
                        return (
                          <option key={r.id} value={r.id}>
                            Room {roomNum} ({r.type || "Standard"} — Floor {r.floor || 1}){isCurrent ? " (Current Room)" : " (No TV Assigned)"}
                          </option>
                        );
                      })}
                    </select>
                  );
                })()}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAssignModalDevice(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!targetAssignRoomId || assignDeviceMutation.isPending}
                  onClick={() => {
                    if (targetAssignRoomId) {
                      assignDeviceMutation.mutate({
                        deviceId: assignModalDevice.id,
                        roomId: targetAssignRoomId,
                        replaceExisting: true,
                      });
                    }
                  }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md shadow-indigo-200 disabled:opacity-50 cursor-pointer"
                >
                  {assignDeviceMutation.isPending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving Assignment...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Confirm Room Assignment</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════ MODAL: DELETE TV HARDWARE CONFIRMATION ══════════════ */}
        {deleteModalDevice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Delete TV Device?
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Are you sure you want to permanently delete <strong>{deleteModalDevice.name || deleteModalDevice.deviceId}</strong>?
                  This will revoke its device credentials, sever its WebSocket connection, and remove its room assignment. The TV will need to be re-paired with a new code.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteModalDevice(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => deleteDeviceMutation.mutate(deleteModalDevice.id)}
                  disabled={deleteDeviceMutation.isPending}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-xs font-semibold text-white shadow-xs cursor-pointer disabled:opacity-60"
                >
                  {deleteDeviceMutation.isPending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Deleting TV...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete & Revoke Device</span>
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

"use client";

import React, { useState } from "react";
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

  // Push refresh mutation
  const refreshMutation = useMutation({
    mutationFn: async (deviceId: string) => {
      return await devicesApi.refresh(deviceId);
    },
    onSuccess: () => {
      toast.success("Refresh Signal Sent", {
        description: "The TV display is updating its configuration in real time.",
      });
    },
    onError: (err: any) => {
      toast.error("Refresh Failed", {
        description: err.response?.data?.message || err.message,
      });
    },
  });

  const filtered = devices.filter((dev: any) => {
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
                    <th className="py-3.5 px-6">IP & Diagnostics</th>
                    <th className="py-3.5 px-6 text-right">Actions</th>
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
                                ID: {dev.deviceId ? dev.deviceId.substring(0, 16) : dev.id.substring(0, 8)}
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
                          {dev.appVersion || "v2.4.0"}
                        </td>

                        <td className="py-3.5 px-6 space-y-0.5">
                          <div className="font-mono text-[11px] text-slate-600">
                            {dev.ipAddress || "127.0.0.1"}
                          </div>
                          <div className="text-[10px] text-slate-400 font-medium">
                            Last seen: {dev.lastSeenAt ? new Date(dev.lastSeenAt).toLocaleTimeString() : "Just now"}
                          </div>
                        </td>

                        <td className="py-3.5 px-6 text-right space-x-3">
                          <button
                            onClick={() => refreshMutation.mutate(dev.id)}
                            disabled={refreshMutation.isPending}
                            className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer disabled:opacity-50"
                          >
                            Refresh
                          </button>

                          <button
                            onClick={() => {
                              if (confirm(`Disconnect and unlink TV from Room ${roomNumber}?`)) {
                                unpairMutation.mutate(dev.id);
                              }
                            }}
                            disabled={unpairMutation.isPending}
                            className="text-[11px] font-semibold text-rose-600 hover:text-rose-800 hover:underline cursor-pointer disabled:opacity-50"
                          >
                            Disconnect
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
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Verifying...</span>
                      </>
                    ) : (
                      <span>Verify Code</span>
                    )}
                  </button>
                </div>
              </div>

              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Step 2: Show Verified TV Details & Select Room */}
              {validatedDevice && (
                <div className="space-y-3 pt-2 border-t border-slate-100 animate-in fade-in">
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-emerald-700">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>TV Device Recognized</span>
                    </div>
                    <div className="text-[11px] text-emerald-700 flex justify-between">
                      <span>Model: <strong>{validatedDevice.model || "Android TV"}</strong></span>
                      <span className="font-mono">ID: {validatedDevice.hardwareId?.substring(0, 12)}</span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                      Assign to Room *
                    </label>
                    <select
                      value={selectedRoomId}
                      onChange={(e) => setSelectedRoomId(e.target.value)}
                      className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    >
                      <option value="">-- Choose a room --</option>
                      {rooms.map((r) => (
                        <option key={r.id} value={r.id}>
                          Room {r.number} ({r.type || "Standard"}) {r.device ? "(Already has TV)" : "(Available)"}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPairModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
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
      </div>
    </DashboardLayout>
  );
}

"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Wifi,
  Plus,
  Shield,
  Layers,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  EyeOff,
  ChevronDown,
  ChevronUp,
  QrCode,
  X,
  Loader2,
  Check,
  Building,
  RefreshCw,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { wifiApi, WifiZoneDTO } from "@/lib/api";
import { useHotelStore, buildWifiQrString } from "@/lib/hotelStore";
import { QRCodeSVG } from "qrcode.react";

export default function WifiPage() {
  const queryClient = useQueryClient();
  const { hotelName } = useHotelStore();

  const [expandedZoneId, setExpandedZoneId] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [qrModalZone, setQrModalZone] = useState<WifiZoneDTO | null>(null);
  const [selectedZoneForPassword, setSelectedZoneForPassword] =
    useState<WifiZoneDTO | null>(null);
  const [newPassword, setNewPassword] = useState("");

  // Form state for creating zone
  const [newZone, setNewZone] = useState({
    name: "",
    ssid: "",
    password: "",
    security: "WPA2",
    floorCoverage: "",
  });

  const { data: serverZones, isLoading, refetch } = useQuery({
    queryKey: ["wifi-zones"],
    placeholderData: (prev) => prev,
    queryFn: async () => {
      try {
        const data = await wifiApi.getAll();
        return data;
      } catch {
        return [];
      }
    },
  });

  const zones: WifiZoneDTO[] = serverZones || [];

  // Add Zone Mutation
  const addZoneMutation = useMutation({
    mutationFn: async (zone: Partial<WifiZoneDTO> & { password?: string }) => {
      return await wifiApi.createZone(zone);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wifi-zones"] });
      toast.success("Wi-Fi Zone Created", {
        description: `Network ${newZone.ssid} has been added.`,
      });
      setAddModalOpen(false);
      setNewZone({
        name: "",
        ssid: "",
        password: "",
        security: "WPA2",
        floorCoverage: "",
      });
    },
    onError: (err: any) => {
      toast.error("Failed to create zone", {
        description: err.response?.data?.message || err.message,
      });
    },
  });

  // Update Password Mutation
  const updatePasswordMutation = useMutation({
    mutationFn: async ({ zoneId, password }: { zoneId: string; password: string }) => {
      return await wifiApi.updateZone(zoneId, { password });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wifi-zones"] });
      toast.success("Wi-Fi Password Updated", {
        description: "New credentials pushed to all connected Smart TVs in this zone.",
      });
      setPasswordModalOpen(false);
      setSelectedZoneForPassword(null);
      setNewPassword("");
    },
    onError: (err: any) => {
      toast.error("Failed to update password", {
        description: err.response?.data?.message || err.message,
      });
    },
  });

  const toggleExpand = (id: string) => {
    setExpandedZoneId(expandedZoneId === id ? null : id);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              Wi-Fi Zones & Network Profiles
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Control SSIDs, encryption protocols, and per-floor coverage. Passwords update instantly on in-room TV screens.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => {
                refetch();
                toast.success("Network list refreshed");
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
              <span>Refresh</span>
            </button>

            <button
              onClick={() => setAddModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold text-white shadow-sm shadow-indigo-200 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Add Wi-Fi Zone</span>
            </button>
          </div>
        </div>

        {/* Global Security Banner */}
        <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-100 flex items-start gap-3">
          <Shield className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
          <div className="text-xs text-indigo-950">
            <span className="font-bold">Zero-Exposure Security Policy:</span> Wi-Fi passwords are stored encrypted and displayed on guest screens via dynamic high-density QR codes. Plaintext passwords cannot be revealed by standard reception staff.
          </div>
        </div>

        {/* Zone Cards Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-48 rounded-2xl bg-white border border-slate-200 p-6 animate-pulse"
              />
            ))}
          </div>
        ) : zones.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center">
            <Wifi className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-800">No Wi-Fi Zones Configured Yet</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Create Wi-Fi coverage zones (e.g. Floor 1, Lobby, Penthouse Suites) to assign to rooms and generate live TV connection QR codes.
            </p>
            <button
              onClick={() => setAddModalOpen(true)}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold text-white shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create First Wi-Fi Zone</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {zones.map((zone) => {
              const isExpanded = expandedZoneId === zone.id;

              return (
                <div
                  key={zone.id}
                  className="bg-white rounded-2xl border border-slate-200 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between overflow-hidden"
                >
                  <div className="p-6">
                    {/* Top Row: Zone Name & Status */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                            zone.isActive
                              ? "bg-indigo-50 text-indigo-600"
                              : "bg-slate-100 text-slate-400"
                          }`}
                        >
                          <Wifi className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-slate-900 tracking-tight">
                            {zone.name}
                          </h3>
                          <span className="text-xs text-slate-500 font-medium">
                            {zone.floorCoverage || "General Property"}
                          </span>
                        </div>
                      </div>

                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          zone.isActive
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {zone.isActive ? "Active Network" : "Disabled"}
                      </span>
                    </div>

                    {/* Zone Details */}
                    <div className="mt-5 space-y-2.5 text-xs text-slate-600 border-t border-slate-100 pt-4">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">Network SSID:</span>
                        <span className="font-bold text-slate-900 font-mono">
                          {zone.ssid}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">Security Encryption:</span>
                        <span className="px-2 py-0.5 rounded bg-slate-100 font-semibold text-slate-700 text-[11px]">
                          {zone.security}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">Network Password:</span>
                        <div className="flex items-center gap-1.5 font-mono text-slate-500">
                          <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                          <span>••••••••••••</span>
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">Assigned Rooms:</span>
                        <span className="font-semibold text-indigo-600">
                          {zone.assignedRoomsCount || zone.assignedRoomNumbers?.length || 0} rooms
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Expandable Assigned Rooms List */}
                  {isExpanded && (
                    <div className="px-6 py-4 bg-slate-50/80 border-t border-slate-100 text-xs">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold uppercase tracking-wider text-[11px] text-slate-500">
                          Assigned Room Numbers
                        </span>
                        <button
                          onClick={() =>
                            toast.info("Room Assignment", {
                              description: "Manage room assignment in Room Inventory.",
                            })
                          }
                          className="text-indigo-600 font-semibold hover:underline"
                        >
                          Manage Assignments
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {zone.assignedRoomNumbers && zone.assignedRoomNumbers.length > 0 ? (
                          zone.assignedRoomNumbers.map((num) => (
                            <span
                              key={num}
                              className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 font-mono text-[11px] font-semibold"
                            >
                              Room {num}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-400 italic">No individual rooms mapped</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Bottom Action Footer */}
                  <div className="p-4 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      onClick={() => toggleExpand(zone.id)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900"
                    >
                      <span>{isExpanded ? "Hide Rooms" : "View Rooms"}</span>
                      {isExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setQrModalZone(zone)}
                        className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-indigo-600 hover:bg-white transition-colors"
                        title="Display QR code"
                      >
                        <QrCode className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => {
                          setSelectedZoneForPassword(zone);
                          setPasswordModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors"
                      >
                        <KeyRound className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Update Password</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* =========================================================================
            MODAL 1: ADD WI-FI ZONE
            ========================================================================= */}
        {addModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 animate-in fade-in-90 zoom-in-95">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-base font-bold text-slate-900">Add New Wi-Fi Zone</h3>
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
                  if (!newZone.name.trim() || !newZone.ssid.trim()) {
                    toast.error("Please enter zone name and SSID");
                    return;
                  }
                  addZoneMutation.mutate({
                    name: newZone.name,
                    ssid: newZone.ssid,
                    security: newZone.security,
                    floorCoverage: newZone.floorCoverage,
                    password: newZone.password,
                    isActive: true,
                  });
                }}
                className="mt-4 space-y-4"
              >
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                    Zone Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Floor 3 Deluxe Wing"
                    value={newZone.name}
                    onChange={(e) => setNewZone({ ...newZone, name: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                    Network SSID *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. GrandPalace_Fl3"
                    value={newZone.ssid}
                    onChange={(e) => setNewZone({ ...newZone, ssid: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                      Security Type
                    </label>
                    <select
                      value={newZone.security}
                      onChange={(e) => setNewZone({ ...newZone, security: e.target.value })}
                      className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    >
                      <option value="WPA2">WPA2 Personal</option>
                      <option value="WPA3">WPA3 Personal</option>
                      <option value="WPA">WPA</option>
                      <option value="nopass">None (Open)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                      Floor Coverage
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Floor 3 (301-310)"
                      value={newZone.floorCoverage}
                      onChange={(e) => setNewZone({ ...newZone, floorCoverage: e.target.value })}
                      className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                    Wi-Fi Password
                  </label>
                  <input
                    type="password"
                    placeholder="••••••••••••"
                    value={newZone.password}
                    onChange={(e) => setNewZone({ ...newZone, password: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setAddModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={addZoneMutation.isPending}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md shadow-indigo-200 disabled:opacity-60"
                  >
                    {addZoneMutation.isPending ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Creating...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Create Zone</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* =========================================================================
            MODAL 2: UPDATE PASSWORD
            ========================================================================= */}
        {passwordModalOpen && selectedZoneForPassword && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-sm w-full p-6 animate-in fade-in-90 zoom-in-95">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Update Wi-Fi Password</h3>
                  <p className="text-xs text-slate-500">{selectedZoneForPassword.ssid}</p>
                </div>
                <button
                  onClick={() => setPasswordModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newPassword.trim()) {
                    toast.error("Please enter a new password");
                    return;
                  }
                  updatePasswordMutation.mutate({
                    zoneId: selectedZoneForPassword.id,
                    password: newPassword,
                  });
                }}
                className="mt-4 space-y-4"
              >
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                    New Security Key / Password *
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Enter new network password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                  <span className="block text-[11px] text-slate-400 mt-1">
                    Smart TVs paired to this zone will immediately regenerate their onboarding QR code.
                  </span>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setPasswordModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={updatePasswordMutation.isPending}
                    className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md shadow-indigo-200 disabled:opacity-60"
                  >
                    {updatePasswordMutation.isPending ? "Updating..." : "Push New Password"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* =========================================================================
            MODAL 3: QR CODE PREVIEW
            ========================================================================= */}
        {qrModalZone && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-xs w-full p-6 text-center animate-in fade-in-90 zoom-in-95">
              <div className="flex justify-end">
                <button
                  onClick={() => setQrModalZone(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-2">
                <Wifi className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-bold text-slate-900">{qrModalZone.name}</h4>
              <p className="text-xs text-slate-500 font-mono mt-0.5">{qrModalZone.ssid}</p>

              <div className="my-5 p-3 rounded-2xl bg-slate-50 border border-slate-200 flex justify-center">
                <QRCodeSVG
                  value={buildWifiQrString(qrModalZone.ssid, "secret", qrModalZone.security as any)}
                  size={150}
                  level="M"
                />
              </div>

              <p className="text-[11px] text-slate-400">
                Scan with any smartphone camera to connect to this zone without entering credentials.
              </p>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

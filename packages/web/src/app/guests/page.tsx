"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users,
  Search,
  Phone,
  Mail,
  DoorOpen,
  Calendar,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowRight,
  Filter,
  RefreshCw,
  Trash2,
  Loader2,
  AlertCircle,
  Building2,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { guestsApi, GuestDTO } from "@/lib/api";

export default function GuestsPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [deleteGuestModal, setDeleteGuestModal] = useState<GuestDTO | null>(null);

  // Fetch real guests directly from PostgreSQL guests table
  const { data: serverGuests, isLoading, refetch } = useQuery({
    queryKey: ["guests"],
    placeholderData: (prev) => prev,
    queryFn: async () => {
      try {
        return await guestsApi.getAll();
      } catch {
        return [];
      }
    },
  });

  const deleteGuestMutation = useMutation({
    mutationFn: async (guestId: string) => {
      return await guestsApi.delete(guestId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guests"] });
      toast.success("Guest Record Removed", {
        description: "The guest entry has been deleted from hotel records.",
      });
      setDeleteGuestModal(null);
    },
    onError: (err: any) => {
      toast.error("Failed to delete guest", {
        description: err.response?.data?.message || err.message,
      });
    },
  });

  const processedGuests = useMemo(() => {
    const guestsList: GuestDTO[] = serverGuests || [];
    return guestsList.map((g) => {
      const latestBooking = g.bookings && g.bookings.length > 0 ? g.bookings[0] : null;
      const isCurrentlyCheckedIn = latestBooking?.status === "CHECKED_IN";
      const status: "IN_HOUSE" | "CHECKED_OUT" | "REGISTERED" = isCurrentlyCheckedIn
        ? "IN_HOUSE"
        : latestBooking?.status === "CHECKED_OUT"
        ? "CHECKED_OUT"
        : "REGISTERED";

      const name = `${g.firstName} ${g.lastName || ""}`.trim() || "Guest";
      const roomNumber = latestBooking?.room?.roomNumber || "—";
      const roomType = latestBooking?.room?.roomType?.name || "Standard";

      let checkInStr = "—";
      let checkOutStr = "—";
      if (latestBooking?.checkInDate) {
        checkInStr = new Date(latestBooking.checkInDate).toLocaleDateString([], {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
      } else {
        checkInStr = new Date(g.createdAt).toLocaleDateString([], {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
      }

      if (latestBooking?.checkOutDate) {
        checkOutStr = new Date(latestBooking.checkOutDate).toLocaleDateString([], {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
      }

      return {
        raw: g,
        id: g.id,
        name,
        phone: g.phone || "N/A",
        email: g.email || "N/A",
        roomNumber,
        roomType,
        status,
        checkIn: checkInStr,
        checkOut: checkOutStr,
        nights: latestBooking?.nights || 1,
        createdAt: g.createdAt,
      };
    });
  }, [serverGuests]);

  const filteredGuests = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return processedGuests.filter((g) => {
      if (filterStatus !== "ALL" && g.status !== filterStatus) return false;
      if (q) {
        return (
          g.name.toLowerCase().includes(q) ||
          g.email.toLowerCase().includes(q) ||
          g.phone.includes(q) ||
          g.roomNumber.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [processedGuests, filterStatus, searchQuery]);

  const inHouseCount = useMemo(() => processedGuests.filter((g) => g.status === "IN_HOUSE").length, [processedGuests]);
  const checkedOutCount = useMemo(() => processedGuests.filter((g) => g.status === "CHECKED_OUT").length, [processedGuests]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-600" />
              <span>Guest Directory</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Live guest records entered into hotel system during front desk check-in.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => {
                refetch();
                toast.success("Guest records refreshed");
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs cursor-pointer transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
              <span>Refresh</span>
            </button>

            <Link
              href="/"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold text-white shadow-sm shadow-indigo-200 transition-all cursor-pointer"
            >
              <span>New Check-In</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Total Guest Profiles
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-slate-900">{processedGuests.length}</span>
              <span className="text-xs text-slate-400">recorded guests</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
            <span className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider block">
              Currently In-House
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-emerald-600">{inHouseCount}</span>
              <span className="text-xs text-slate-400">active hotel stays</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
            <span className="text-[11px] font-semibold text-indigo-600 uppercase tracking-wider block">
              Completed Stays
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-indigo-600">{checkedOutCount}</span>
              <span className="text-xs text-slate-400">past departures</span>
            </div>
          </div>
        </div>

        {/* Search & Filter */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search guest by name, phone, or room #..."
              className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            {[
              { id: "ALL", label: `All (${processedGuests.length})` },
              { id: "IN_HOUSE", label: `In-House (${inHouseCount})` },
              { id: "CHECKED_OUT", label: `Past Stays (${checkedOutCount})` },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterStatus(tab.id)}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  filterStatus === tab.id
                    ? "bg-white text-slate-900 shadow-2xs font-bold"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Guests Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                  <th className="py-3.5 px-6">Guest Profile</th>
                  <th className="py-3.5 px-6">Contact Info</th>
                  <th className="py-3.5 px-6">Room Assigned</th>
                  <th className="py-3.5 px-6">Stay Period</th>
                  <th className="py-3.5 px-6">Stay Status</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto text-indigo-500 mb-2" />
                      <span>Loading guest records from database...</span>
                    </td>
                  </tr>
                ) : filteredGuests.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      No guests match the search or selected filter.
                    </td>
                  </tr>
                ) : (
                  filteredGuests.map((guest) => {
                    const isInHouse = guest.status === "IN_HOUSE";
                    const isCheckedOut = guest.status === "CHECKED_OUT";

                    return (
                      <tr key={guest.id} className="hover:bg-slate-50/70 transition-colors">
                        {/* Name */}
                        <td className="py-3.5 px-6">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-700 font-bold flex items-center justify-center shrink-0">
                              {guest.name[0]}
                            </div>
                            <div>
                              <span className="font-bold text-slate-900 block">{guest.name}</span>
                              <span className="text-[11px] text-slate-400 font-mono">
                                {guest.id.substring(0, 8)}...
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Contact */}
                        <td className="py-3.5 px-6 space-y-0.5">
                          <div className="flex items-center gap-1.5 text-slate-600">
                            <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>{guest.phone}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                            <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>{guest.email}</span>
                          </div>
                        </td>

                        {/* Room */}
                        <td className="py-3.5 px-6">
                          {guest.roomNumber !== "—" ? (
                            <>
                              <span className="font-bold font-mono text-indigo-600 block">
                                Room {guest.roomNumber}
                              </span>
                              <span className="text-[11px] text-slate-400">{guest.roomType}</span>
                            </>
                          ) : (
                            <span className="text-slate-400 italic">No room assigned</span>
                          )}
                        </td>

                        {/* Dates */}
                        <td className="py-3.5 px-6">
                          <span className="font-medium text-slate-800 block">
                            {guest.checkIn} – {guest.checkOut}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {guest.nights} {guest.nights === 1 ? "night" : "nights"}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-6">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              isInHouse
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : isCheckedOut
                                ? "bg-slate-100 text-slate-600 border border-slate-200"
                                : "bg-blue-50 text-blue-700 border border-blue-200"
                            }`}
                          >
                            {isInHouse ? "In-House" : isCheckedOut ? "Checked Out" : "Registered"}
                          </span>
                        </td>

                        {/* Action */}
                        <td className="py-3.5 px-6 text-right">
                          <div className="flex items-center justify-end gap-2.5">
                            {guest.roomNumber !== "—" && (
                              <Link
                                href={`/rooms`}
                                className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
                              >
                                View Room
                              </Link>
                            )}

                            <button
                              onClick={() => setDeleteGuestModal(guest.raw)}
                              title="Delete guest record"
                              className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal: Delete Guest Confirmation */}
        {deleteGuestModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Delete Guest Record?</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Are you sure you want to remove the record for{" "}
                  <strong>
                    {deleteGuestModal.firstName} {deleteGuestModal.lastName}
                  </strong>{" "}
                  from hotel database? Past booking history will be preserved in logs.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteGuestModal(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => deleteGuestMutation.mutate(deleteGuestModal.id)}
                  disabled={deleteGuestMutation.isPending}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-xs font-semibold text-white shadow-xs cursor-pointer disabled:opacity-60"
                >
                  {deleteGuestMutation.isPending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Record</span>
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

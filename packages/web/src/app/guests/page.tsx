"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
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
} from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { roomsApi, RoomDTO } from "@/lib/api";

interface GuestRecord {
  id: string;
  name: string;
  phone: string;
  email: string;
  roomNumber: string;
  roomType: string;
  status: "IN_HOUSE" | "CHECKED_OUT" | "UPCOMING";
  checkIn: string;
  checkOut: string;
  nights: number;
}

export default function GuestsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");

  const { data: rooms, isLoading } = useQuery({
    queryKey: ["rooms"],
    queryFn: async () => {
      try {
        return await roomsApi.getAll();
      } catch {
        return [];
      }
    },
  });

  const liveGuests: GuestRecord[] = (rooms || [])
    .filter((r) => r.currentGuest && r.status === "OCCUPIED")
    .map((r) => ({
      id: r.currentGuest?.id || `gst-${r.id}`,
      name:
        `${r.currentGuest?.firstName || ""} ${r.currentGuest?.lastName || ""}`.trim() ||
        r.currentGuest?.name ||
        "Guest",
      phone: r.currentGuest?.phone || "N/A",
      email: r.currentGuest?.email || "N/A",
      roomNumber: r.number,
      roomType: r.type || "Standard Room",
      status: "IN_HOUSE" as const,
      checkIn: r.currentGuest?.checkIn
        ? new Date(r.currentGuest.checkIn).toLocaleDateString()
        : "Active Stay",
      checkOut: r.currentGuest?.checkOut
        ? new Date(r.currentGuest.checkOut).toLocaleDateString()
        : "Standard Checkout",
      nights: 1,
    }));

  const filteredGuests = liveGuests.filter((g) => {
    if (filterStatus !== "ALL" && g.status !== filterStatus) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        g.name.toLowerCase().includes(q) ||
        g.email.toLowerCase().includes(q) ||
        g.phone.includes(q) ||
        g.roomNumber.includes(q)
      );
    }
    return true;
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Guest Directory</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Active guest profiles, stay durations, and contact preferences.
            </p>
          </div>

          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold text-white shadow-sm shadow-indigo-200 transition-all self-start sm:self-auto"
          >
            <span>Front Desk Check-In</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
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
              { id: "ALL", label: "All Guests" },
              { id: "IN_HOUSE", label: "In-House" },
              { id: "CHECKED_OUT", label: "Past Stays" },
              { id: "UPCOMING", label: "Upcoming" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterStatus(tab.id)}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                  filterStatus === tab.id
                    ? "bg-white text-slate-900 shadow-2xs"
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
                  <th className="py-3.5 px-6">Status</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredGuests.map((guest) => {
                  const isInHouse = guest.status === "IN_HOUSE";
                  const isUpcoming = guest.status === "UPCOMING";

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
                            <span className="text-[11px] text-slate-400">ID: {guest.id}</span>
                          </div>
                        </div>
                      </td>

                      {/* Contact */}
                      <td className="py-3.5 px-6 space-y-0.5">
                        <div className="flex items-center gap-1.5 text-slate-600">
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span>{guest.phone}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                          <Mail className="w-3 h-3 text-slate-400" />
                          <span>{guest.email}</span>
                        </div>
                      </td>

                      {/* Room */}
                      <td className="py-3.5 px-6">
                        <span className="font-bold font-mono text-indigo-600 block">
                          Room {guest.roomNumber}
                        </span>
                        <span className="text-[11px] text-slate-400">{guest.roomType}</span>
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
                              ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                              : isUpcoming
                              ? "bg-sky-50 text-sky-700 border border-sky-200"
                              : "bg-slate-100 text-slate-600 border border-slate-200"
                          }`}
                        >
                          {guest.status.replace("_", " ")}
                        </span>
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-6 text-right">
                        <Link
                          href={`/rooms/${guest.roomNumber}`}
                          className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
                        >
                          View Room
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

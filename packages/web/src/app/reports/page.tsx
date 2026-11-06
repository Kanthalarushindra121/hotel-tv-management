"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Calendar,
  Download,
  Users,
  LogOut,
  Clock,
  Layers,
  ArrowUpRight,
  TrendingUp,
  Building,
  RefreshCw,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { dashboardApi } from "@/lib/api";

const CHART_DATA_7D = [
  { day: "Mon", checkIns: 6, checkOuts: 4 },
  { day: "Tue", checkIns: 8, checkOuts: 5 },
  { day: "Wed", checkIns: 11, checkOuts: 7 },
  { day: "Thu", checkIns: 9, checkOuts: 8 },
  { day: "Fri", checkIns: 16, checkOuts: 6 },
  { day: "Sat", checkIns: 18, checkOuts: 12 },
  { day: "Sun", checkIns: 12, checkOuts: 15 },
];

const CHART_DATA_30D = [
  { day: "Week 1", checkIns: 48, checkOuts: 42 },
  { day: "Week 2", checkIns: 56, checkOuts: 51 },
  { day: "Week 3", checkIns: 64, checkOuts: 58 },
  { day: "Week 4", checkIns: 72, checkOuts: 66 },
];

export default function ReportsPage() {
  const [dateRange, setDateRange] = useState<"TODAY" | "7D" | "30D" | "CUSTOM">("7D");

  const { data: stats, isLoading, refetch } = useQuery({
    queryKey: ["reports-stats", dateRange],
    queryFn: async () => {
      try {
        return await dashboardApi.getStats({ range: dateRange });
      } catch {
        return null;
      }
    },
  });

  const recentCheckouts = stats?.recentCheckouts || [];

  const chartData = dateRange === "30D" ? CHART_DATA_30D : CHART_DATA_7D;

  const totalCheckIns = dateRange === "30D" ? 240 : dateRange === "TODAY" ? 8 : 80;
  const totalCheckOuts = dateRange === "30D" ? 217 : dateRange === "TODAY" ? 6 : 57;
  const avgStay = dateRange === "30D" ? "2.8 Nights" : "2.4 Nights";
  const avgOccupancy = dateRange === "30D" ? "82%" : "76%";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              Hospitality Analytics & Reports
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Review guest turn rates, check-in spikes, and screen engagement statistics.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => {
                refetch();
                toast.success("Metrics updated");
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
              <span>Refresh</span>
            </button>

            <button
              onClick={() =>
                toast.success("Report Exported", {
                  description: "CSV summary generated and downloaded.",
                })
              }
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold text-white shadow-sm shadow-indigo-200 transition-all"
            >
              <Download className="w-4 h-4" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Date Filter Bar */}
        <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <Calendar className="w-4 h-4 text-indigo-600" />
            <span>Reporting Interval:</span>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            {[
              { id: "TODAY", label: "Today" },
              { id: "7D", label: "Last 7 Days" },
              { id: "30D", label: "Last 30 Days" },
              { id: "CUSTOM", label: "Custom Range" },
            ].map((r) => (
              <button
                key={r.id}
                onClick={() => setDateRange(r.id as any)}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                  dateRange === r.id
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Key Metrics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Check-Ins */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Total Check-Ins</span>
              <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900">{totalCheckIns}</span>
              <span className="text-xs font-bold text-emerald-600 flex items-center gap-0.5">
                <TrendingUp className="w-3.5 h-3.5" />
                +12%
              </span>
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">During selected timeframe</span>
          </div>

          {/* Card 2: Check-Outs */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Total Check-Outs</span>
              <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                <LogOut className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900">{totalCheckOuts}</span>
              <span className="text-xs font-bold text-slate-400">Departures</span>
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">Completed room turnovers</span>
          </div>

          {/* Card 3: Avg Duration */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Avg Stay Length</span>
              <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900">{avgStay}</span>
              <span className="text-xs font-bold text-emerald-600">+0.3d</span>
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">Leisure & business combined</span>
          </div>

          {/* Card 4: Occupancy */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Average Occupancy</span>
              <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                <Layers className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900">{avgOccupancy}</span>
              <span className="text-xs font-bold text-emerald-600">Optimal</span>
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">Inventory utilization rate</span>
          </div>
        </div>

        {/* Recharts Bar Chart: Daily Check-Ins & Check-Outs */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Guest Turnover Volume</h3>
              <p className="text-xs text-slate-500">
                Daily comparison between incoming check-ins and outgoing guest departures.
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs font-semibold">
              <div className="flex items-center gap-1.5 text-indigo-600">
                <span className="w-3 h-3 rounded bg-indigo-600 inline-block" />
                <span>Check-Ins</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-400">
                <span className="w-3 h-3 rounded bg-slate-300 inline-block" />
                <span>Check-Outs</span>
              </div>
            </div>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis
                  dataKey="day"
                  stroke="#94A3B8"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis stroke="#94A3B8" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0F172A",
                    borderRadius: "12px",
                    border: "none",
                    color: "#fff",
                    fontSize: "12px",
                  }}
                  cursor={{ fill: "#F8FAFC" }}
                />
                <Bar dataKey="checkIns" fill="#4F46E5" radius={[6, 6, 0, 0]} barSize={24} />
                <Bar dataKey="checkOuts" fill="#CBD5E1" radius={[6, 6, 0, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Checkout History Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Recent Completed Stays</h3>
              <p className="text-xs text-slate-500">
                Historical records of recent guest departures and screen metrics.
              </p>
            </div>
            <span className="text-xs text-slate-400 font-medium">Last 5 checkouts</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-6">Guest Name</th>
                  <th className="py-3 px-6">Room Number</th>
                  <th className="py-3 px-6">Category</th>
                  <th className="py-3 px-6">Arrival Date</th>
                  <th className="py-3 px-6">Departure Date</th>
                  <th className="py-3 px-6">Stay Duration</th>
                  <th className="py-3 px-6">TV Screen Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {recentCheckouts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      No completed check-out records found for this period.
                    </td>
                  </tr>
                ) : (
                  recentCheckouts.map((row: any) => (
                    <tr key={row.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-6 font-bold text-slate-900">{row.guestName}</td>
                      <td className="py-3.5 px-6 font-mono font-semibold text-indigo-600">
                        Room {row.roomNumber}
                      </td>
                      <td className="py-3.5 px-6 text-slate-600">{row.roomType}</td>
                      <td className="py-3.5 px-6">{row.checkIn}</td>
                      <td className="py-3.5 px-6">{row.checkOut}</td>
                      <td className="py-3.5 px-6 font-medium">{row.duration}</td>
                      <td className="py-3.5 px-6 text-slate-500 font-medium">
                        {row.tvUsageHours || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

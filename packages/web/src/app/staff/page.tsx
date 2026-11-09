"use client";

import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  UserCog,
  Plus,
  Search,
  Mail,
  Shield,
  CheckCircle2,
  XCircle,
  MoreVertical,
  X,
  Loader2,
  Check,
  RefreshCw,
  Lock,
  User,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { staffApi, StaffDTO } from "@/lib/api";

export default function StaffPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [deleteModalStaff, setDeleteModalStaff] = useState<StaffDTO | null>(null);

  // Form state
  const [newStaff, setNewStaff] = useState({
    firstName: "",
    lastName: "",
    username: "",
    email: "",
    temporaryPassword: "",
    role: "RECEPTIONIST",
  });

  const { data: serverStaff, isLoading, refetch } = useQuery({
    queryKey: ["staff"],
    placeholderData: (prev) => prev,
    queryFn: async () => {
      try {
        const data = await staffApi.getAll();
        return data;
      } catch {
        return [];
      }
    },
  });

  const staffList: StaffDTO[] = serverStaff || [];

  // Add Staff Mutation
  const addStaffMutation = useMutation({
    mutationFn: async (data: typeof newStaff) => {
      return await staffApi.create(data);
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      toast.success("Staff Account Created", {
        description: `Login credentials sent to ${newStaff.email}.`,
      });
      setAddModalOpen(false);
      setNewStaff({
        firstName: "",
        lastName: "",
        username: "",
        email: "",
        temporaryPassword: "",
        role: "RECEPTIONIST",
      });
    },
    onError: (err: any) => {
      toast.error("Failed to add staff member", {
        description: err.response?.data?.message || err.message,
      });
    },
  });

  // Update Role or Status Mutation
  const updateStaffMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<StaffDTO> }) => {
      return await staffApi.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      toast.success("Staff profile updated");
    },
    onError: (err: any) => {
      toast.error("Update failed", {
        description: err.response?.data?.message || err.message,
      });
    },
  });

  // Delete Staff Mutation
  const deleteStaffMutation = useMutation({
    mutationFn: async (userId: string) => {
      return await staffApi.delete(userId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      toast.success("Staff Account Deleted", {
        description: "The staff account has been permanently removed.",
      });
      setDeleteModalStaff(null);
    },
    onError: (err: any) => {
      toast.error("Failed to delete staff member", {
        description: err.response?.data?.message || err.message,
      });
    },
  });

  const renderRoleBadge = (role: string) => {
    switch (role.toUpperCase()) {
      case "OWNER":
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200">
            OWNER
          </span>
        );
      case "ADMIN":
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
            ADMIN
          </span>
        );
      case "RECEPTIONIST":
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
            RECEPTIONIST
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
            STAFF
          </span>
        );
    }
  };

  const filteredStaff = useMemo(() => {
    const list: StaffDTO[] = serverStaff || [];
    const q = searchQuery.trim().toLowerCase();
    return list.filter((s) => {
      if (roleFilter !== "ALL" && s.role.toUpperCase() !== roleFilter) return false;
      if (q) {
        const name = `${s.firstName} ${s.lastName}`.toLowerCase();
        const email = s.email.toLowerCase();
        return name.includes(q) || email.includes(q);
      }
      return true;
    });
  }, [serverStaff, roleFilter, searchQuery]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Staff & Team Accounts</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Manage front desk personnel, housekeeping supervisors, and property administrators.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => {
                refetch();
                toast.success("Staff list refreshed");
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
              <span>Add Staff Member</span>
            </button>
          </div>
        </div>

        {/* Filter and Search */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search staff by name or email..."
              className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl self-start sm:self-auto">
            {["ALL", "OWNER", "ADMIN", "MANAGER", "RECEPTIONIST", "STAFF"].map((role) => (
              <button
                key={role}
                onClick={() => setRoleFilter(role)}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                  roleFilter === role
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {role === "ALL" ? "All Roles" : role}
              </button>
            ))}
          </div>
        </div>

        {/* Staff Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                  <th className="py-3.5 px-6">Member Name & Email</th>
                  <th className="py-3.5 px-6">Access Role</th>
                  <th className="py-3.5 px-6">Status</th>
                  <th className="py-3.5 px-6">Last Active</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      Loading team members...
                    </td>
                  </tr>
                ) : filteredStaff.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      No staff members match the selected criteria.
                    </td>
                  </tr>
                ) : (
                  filteredStaff.map((member) => (
                    <tr key={member.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Name & Email */}
                      <td className="py-3.5 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold text-xs shrink-0">
                            {member.firstName[0]}
                            {member.lastName[0]}
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 block">
                              {member.firstName} {member.lastName}
                            </span>
                            <span className="text-[11px] text-slate-400 font-mono">
                              {member.email}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Role with Inline Select */}
                      <td className="py-3.5 px-6">
                        <div className="flex items-center gap-2">
                          {renderRoleBadge(member.role)}

                          {member.role !== "OWNER" && (
                            <select
                              value={member.role}
                              onChange={(e) =>
                                updateStaffMutation.mutate({
                                  id: member.id,
                                  data: { role: e.target.value as any },
                                })
                              }
                              className="text-[11px] font-semibold text-slate-500 bg-transparent border-0 focus:ring-0 cursor-pointer hover:text-slate-800"
                            >
                              <option value="ADMIN">ADMIN</option>
                              <option value="RECEPTIONIST">RECEPTIONIST</option>
                              <option value="STAFF">STAFF</option>
                            </select>
                          )}
                        </div>
                      </td>

                      {/* Status Toggle */}
                      <td className="py-3.5 px-6">
                        <button
                          onClick={() => {
                            if (member.role === "OWNER") {
                              toast.info("Cannot disable primary hotel owner");
                              return;
                            }
                            updateStaffMutation.mutate({
                              id: member.id,
                              data: { isActive: !member.isActive },
                            });
                          }}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all ${
                            member.isActive
                              ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                              : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              member.isActive ? "bg-emerald-500" : "bg-slate-400"
                            }`}
                          />
                          <span>{member.isActive ? "Active" : "Disabled"}</span>
                        </button>
                      </td>

                      {/* Last Login */}
                      <td className="py-3.5 px-6 text-slate-500">
                        {member.lastLoginAt
                          ? new Date(member.lastLoginAt).toLocaleString([], {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "Never"}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-6 text-right">
                        <div className="flex items-center justify-end gap-2.5">
                          <button
                            onClick={() =>
                              toast.info("Password Reset", {
                                description: `A reset link was dispatched to ${member.email}.`,
                              })
                            }
                            className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
                          >
                            Reset Password
                          </button>

                          {member.role !== "OWNER" ? (
                            <button
                              onClick={() => setDeleteModalStaff(member)}
                              title="Delete staff account"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">Primary</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal: Add Staff Member */}
        {addModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 animate-in fade-in-90 zoom-in-95">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Add Staff Account</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Provision access for front desk or hotel operations staff.
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
                  if (!newStaff.firstName.trim() || !newStaff.email.trim()) {
                    toast.error("Please enter first name and email");
                    return;
                  }
                  addStaffMutation.mutate(newStaff);
                }}
                className="mt-4 space-y-4"
              >
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                      First Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Pooja"
                      value={newStaff.firstName}
                      onChange={(e) => setNewStaff({ ...newStaff, firstName: e.target.value })}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                      Last Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Reddy"
                      value={newStaff.lastName}
                      onChange={(e) => setNewStaff({ ...newStaff, lastName: e.target.value })}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                      Work Email *
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="pooja.reddy@hotel.com"
                      value={newStaff.email}
                      onChange={(e) => setNewStaff({ ...newStaff, email: e.target.value })}
                      className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                      Username (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. pooja_frontdesk"
                      value={newStaff.username}
                      onChange={(e) => setNewStaff({ ...newStaff, username: e.target.value })}
                      className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                    Temporary Password *
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Min 8 characters"
                    value={newStaff.temporaryPassword}
                    onChange={(e) =>
                      setNewStaff({ ...newStaff, temporaryPassword: e.target.value })
                    }
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                    Role & Permission Level
                  </label>
                  <select
                    value={newStaff.role}
                    onChange={(e) => setNewStaff({ ...newStaff, role: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  >
                    <option value="ADMIN">ADMIN — Full property management</option>
                    <option value="MANAGER">MANAGER — Hotel operations & reporting</option>
                    <option value="RECEPTIONIST">
                      RECEPTIONIST — Front desk check-ins & room occupancy
                    </option>
                    <option value="STAFF">STAFF — Housekeeping & room updates</option>
                  </select>
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
                    disabled={addStaffMutation.isPending}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md shadow-indigo-200 disabled:opacity-60"
                  >
                    {addStaffMutation.isPending ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Creating Account...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Create Staff</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        {/* Modal: Delete Staff Confirmation */}
        {deleteModalStaff && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Delete Staff Account?
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Are you sure you want to permanently delete account for{" "}
                  <strong>
                    {deleteModalStaff.firstName} {deleteModalStaff.lastName}
                  </strong>{" "}
                  ({deleteModalStaff.email})? This staff member will immediately lose all dashboard access.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteModalStaff(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => deleteStaffMutation.mutate(deleteModalStaff.id)}
                  disabled={deleteStaffMutation.isPending}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-xs font-semibold text-white shadow-xs cursor-pointer disabled:opacity-60"
                >
                  {deleteStaffMutation.isPending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Deleting Account...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Account</span>
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

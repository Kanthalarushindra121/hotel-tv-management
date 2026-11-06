"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Clock,
  Sparkles,
  ShieldCheck,
  Tv,
  Save,
  Plus,
  Trash2,
  Check,
  Loader2,
  Phone,
  Mail,
  Globe,
  MapPin,
  Utensils,
  Waves,
  Dumbbell,
  Car,
  Coffee,
  Bell,
  Wifi,
  Eye,
  EyeOff,
  QrCode,
  Printer,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useHotelStore, buildWifiQrString } from "@/lib/hotelStore";
import { hotelApi } from "@/lib/api";
import { QRCodeSVG } from "qrcode.react";

type SettingsTab = "hotel" | "wifi" | "time" | "amenities" | "rules" | "tv";

const DEFAULT_RULES = [
  { id: "rule-1", text: "Quiet hours observed from 10:00 PM to 7:00 AM daily.", order: 1 },
  { id: "rule-2", text: "100% smoke-free property in all guest rooms and balconies.", order: 2 },
  { id: "rule-3", text: "Pool and fitness center access is restricted to registered guests.", order: 3 },
  { id: "rule-4", text: "Please dial 9 for 24/7 reception and concierge assistance.", order: 4 },
];

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const hotelStore = useHotelStore();
  const [activeTab, setActiveTab] = useState<SettingsTab>("hotel");
  const [showWifiPassword, setShowWifiPassword] = useState(false);

  // Local editable form state
  const [form, setForm] = useState({
    // 1. Hotel Info
    name: hotelStore.hotelName || "",
    tagline: hotelStore.tagline || "",
    address: "",
    city: "",
    state: "",
    country: "India",
    postalCode: "",
    phone: hotelStore.conciergePhone || "",
    email: "",
    website: "",

    // 2. Time & Locale
    checkInTime: "14:00",
    checkOutTime: hotelStore.checkoutTime || "11:00 AM",
    timezone: "Asia/Kolkata (GMT+5:30)",
    quietHoursStart: hotelStore.quietHoursStart || "10:00 PM",
    quietHoursEnd: hotelStore.quietHoursEnd || "7:00 AM",

    // 3. House Rules
    houseRules: DEFAULT_RULES,

    // 4. TV Appearance
    welcomeMessage: "Welcome to your sanctuary of comfort. Your stay is our passion.",
    checkoutMessage: "We hope you enjoyed your stay. Contact reception (dial 9) for express check-out or luggage assistance.",
    screensaverDelaySeconds: 120,
  });

  // Local Wi-Fi editable form state
  const [wifiForm, setWifiForm] = useState({
    networkName: hotelStore.wifiNetwork || "",
    password: hotelStore.wifiPassword || "",
    securityType: (hotelStore.wifiSecurity as "WPA2" | "WPA3" | "WPA" | "nopass") || "WPA2",
  });

  const [newRuleText, setNewRuleText] = useState("");

  // New Amenity Modal / Form
  const [newAmenityName, setNewAmenityName] = useState("");
  const [newAmenityHours, setNewAmenityHours] = useState("");
  const [newAmenityIcon, setNewAmenityIcon] = useState("sparkles");

  // Fetch from backend
  const { data: serverProfile, isLoading } = useQuery({
    queryKey: ["hotel-profile"],
    queryFn: async () => {
      try {
        return await hotelApi.getProfile();
      } catch {
        return null;
      }
    },
  });

  // Synchronize serverProfile to local form and store
  useEffect(() => {
    if (serverProfile) {
      setForm((prev) => ({
        ...prev,
        name: serverProfile.name || prev.name,
        tagline: serverProfile.tagline || serverProfile.description || prev.tagline,
        address: serverProfile.address || prev.address,
        city: serverProfile.city || prev.city,
        state: serverProfile.state || prev.state,
        country: serverProfile.country || prev.country,
        postalCode: serverProfile.postalCode || prev.postalCode,
        phone: serverProfile.phone || prev.phone,
        email: serverProfile.email || prev.email,
        website: serverProfile.website || prev.website,
        checkInTime: serverProfile.settings?.checkInTime || prev.checkInTime,
        checkOutTime: serverProfile.settings?.checkOutTime || prev.checkOutTime,
        timezone: serverProfile.settings?.timezone || prev.timezone,
        quietHoursStart: serverProfile.settings?.quietHoursStart || prev.quietHoursStart,
        quietHoursEnd: serverProfile.settings?.quietHoursEnd || prev.quietHoursEnd,
        welcomeMessage: serverProfile.settings?.welcomeMessage || prev.welcomeMessage,
        checkoutMessage: serverProfile.settings?.checkoutMessage || prev.checkoutMessage,
      }));

      if (serverProfile.wifiSettings) {
        setWifiForm({
          networkName: serverProfile.wifiSettings.networkName || "",
          password: serverProfile.wifiSettings.password || "",
          securityType: (serverProfile.wifiSettings.securityType as any) || "WPA2",
        });
        hotelStore.updateSettings({
          wifiNetwork: serverProfile.wifiSettings.networkName,
          wifiPassword: serverProfile.wifiSettings.password,
          wifiSecurity: serverProfile.wifiSettings.securityType as any,
        });
      }

      if (serverProfile.amenities && Array.isArray(serverProfile.amenities) && serverProfile.amenities.length > 0) {
        const mapped = serverProfile.amenities.map((a: any) => ({
          id: a.id,
          name: a.customName || a.amenity?.name || "Amenity",
          icon: a.customIcon || a.amenity?.icon || "sparkles",
          hours: a.customName?.includes("(") ? a.customName.split("(")[1]?.replace(")", "") : undefined,
          isActive: a.isActive !== false,
        }));
        hotelStore.updateSettings({ amenities: mapped });
      }

      hotelStore.updateSettings({
        hotelName: serverProfile.name,
        tagline: serverProfile.tagline || serverProfile.description,
        conciergePhone: serverProfile.phone,
        checkoutTime: serverProfile.settings?.checkOutTime || "11:00 AM",
        quietHoursStart: serverProfile.settings?.quietHoursStart || "10:00 PM",
        quietHoursEnd: serverProfile.settings?.quietHoursEnd || "7:00 AM",
      });
    }
  }, [serverProfile]);

  // Save Settings Mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      // 1. Update backend hotel profile
      await hotelApi.updateProfile({
        name: form.name,
        tagline: form.tagline,
        address: form.address,
        city: form.city,
        state: form.state,
        country: form.country,
        postalCode: form.postalCode,
        phone: form.phone,
        email: form.email,
        website: form.website,
      });

      // 2. Update backend hotel settings (Checkout, Quiet Hours, etc.)
      await hotelApi.updateSettings({
        checkInTime: form.checkInTime,
        checkOutTime: form.checkOutTime,
        quietHoursStart: form.quietHoursStart,
        quietHoursEnd: form.quietHoursEnd,
        timezone: form.timezone,
        welcomeMessage: form.welcomeMessage,
        checkoutMessage: form.checkoutMessage,
        screensaverDelay: form.screensaverDelaySeconds,
      });

      // 3. Update Wi-Fi settings in backend
      if (wifiForm.networkName) {
        await hotelApi.updateWifi({
          networkName: wifiForm.networkName,
          password: wifiForm.password,
          securityType: wifiForm.securityType,
        });
      }

      // 4. Update amenities in backend
      if (hotelStore.amenities && hotelStore.amenities.length > 0) {
        await hotelApi.updateAmenities(hotelStore.amenities);
      }

      // 5. Update hotel store for instant local sync
      hotelStore.updateSettings({
        hotelName: form.name,
        tagline: form.tagline,
        conciergePhone: form.phone,
        checkoutTime: form.checkOutTime,
        quietHoursStart: form.quietHoursStart,
        quietHoursEnd: form.quietHoursEnd,
        wifiNetwork: wifiForm.networkName,
        wifiPassword: wifiForm.password,
        wifiSecurity: wifiForm.securityType,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hotel-profile"] });
      toast.success("Settings Saved Successfully", {
        description: "Hotel settings, Wi-Fi credentials, and TV preferences synchronized across all displays.",
      });
    },
    onError: (err: any) => {
      toast.error("Failed to save settings", {
        description: err.response?.data?.message || err.message,
      });
    },
  });

  const handleAddRule = () => {
    if (!newRuleText.trim()) return;
    const newRule = {
      id: `rule-${Date.now()}`,
      text: newRuleText.trim(),
      order: form.houseRules.length + 1,
    };
    setForm((prev) => ({
      ...prev,
      houseRules: [...prev.houseRules, newRule],
    }));
    setNewRuleText("");
    toast.success("House rule added");
  };

  const handleRemoveRule = (id: string) => {
    setForm((prev) => ({
      ...prev,
      houseRules: prev.houseRules.filter((r) => r.id !== id),
    }));
    toast.info("Rule removed");
  };

  const handleAddAmenity = async () => {
    if (!newAmenityName.trim()) {
      toast.error("Amenity name required");
      return;
    }
    const newAmenity = {
      id: `amenity-${Date.now()}`,
      name: newAmenityName.trim(),
      hours: newAmenityHours.trim() || undefined,
      icon: newAmenityIcon,
      isActive: true,
    };

    hotelStore.addAmenity(newAmenityName.trim(), newAmenityHours.trim() || undefined, newAmenityIcon);
    const updatedAmenities = [...hotelStore.amenities, newAmenity];

    try {
      await hotelApi.updateAmenities(updatedAmenities);
    } catch {
      // Local state still active
    }

    setNewAmenityName("");
    setNewAmenityHours("");
    toast.success("Amenity Added", {
      description: `${newAmenity.name} has been added to your TV display amenities.`,
    });
  };

  const handleToggleAmenity = async (id: string) => {
    hotelStore.toggleAmenity(id);
    const updated = hotelStore.amenities.map((a) =>
      a.id === id ? { ...a, isActive: !a.isActive } : a
    );
    try {
      await hotelApi.updateAmenities(updated);
    } catch {
      // Store already updated
    }
  };

  const handleRemoveAmenity = async (id: string) => {
    hotelStore.removeAmenity(id);
    const updated = hotelStore.amenities.filter((a) => a.id !== id);
    try {
      await hotelApi.updateAmenities(updated);
      toast.info("Amenity removed from TV display");
    } catch {
      // Store updated
    }
  };

  const renderAmenityIcon = (iconName: string) => {
    switch (iconName) {
      case "utensils":
        return <Utensils className="w-4 h-4 text-indigo-600" />;
      case "waves":
        return <Waves className="w-4 h-4 text-indigo-600" />;
      case "dumbbell":
        return <Dumbbell className="w-4 h-4 text-indigo-600" />;
      case "car":
        return <Car className="w-4 h-4 text-indigo-600" />;
      case "coffee":
        return <Coffee className="w-4 h-4 text-indigo-600" />;
      case "bell":
        return <Bell className="w-4 h-4 text-indigo-600" />;
      case "wifi":
        return <Wifi className="w-4 h-4 text-indigo-600" />;
      default:
        return <Sparkles className="w-4 h-4 text-indigo-600" />;
    }
  };

  const liveQrString = buildWifiQrString(
    wifiForm.networkName || "SmartStay_Guest",
    wifiForm.password,
    wifiForm.securityType
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Hotel Settings & Wi-Fi Management</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Manage your hotel profile, Wi-Fi credentials with live QR generation, guest amenities, and Smart TV appearance.
            </p>
          </div>

          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold text-white shadow-sm shadow-indigo-200 transition-all disabled:opacity-60 self-start sm:self-auto cursor-pointer"
          >
            {saveMutation.isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>Save All Changes</span>
              </>
            )}
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-white border border-slate-200 overflow-x-auto shadow-xs">
          {[
            { id: "hotel", label: "Hotel Info", icon: Building2 },
            { id: "wifi", label: "Hotel Settings & Wi-Fi", icon: Wifi },
            { id: "time", label: "Time & Schedule", icon: Clock },
            { id: "amenities", label: "Amenities", icon: Sparkles },
            { id: "rules", label: "House Rules", icon: ShieldCheck },
            { id: "tv", label: "TV Appearance", icon: Tv },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as SettingsTab)}
                className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? "text-white" : "text-slate-400"}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* =========================================================================
            TAB 1: HOTEL INFO
            ========================================================================= */}
        {activeTab === "hotel" && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5 animate-in fade-in-50">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Property Information & Contact</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                These details will be displayed across your guest dashboard, invoices, and TV welcome displays.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Property / Hotel Name *
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Royal Grand Palace"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Tagline / Subheading
                </label>
                <input
                  type="text"
                  value={form.tagline}
                  onChange={(e) => setForm({ ...form, tagline: e.target.value })}
                  placeholder="e.g. Boutique comfort in the city center"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Street Address
              </label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="e.g. 100 Main Boulevard"
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  City
                </label>
                <input
                  type="text"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  placeholder="e.g. Mumbai"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  State / Province
                </label>
                <input
                  type="text"
                  value={form.state}
                  onChange={(e) => setForm({ ...form, state: e.target.value })}
                  placeholder="e.g. Maharashtra"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Country
                </label>
                <input
                  type="text"
                  value={form.country}
                  onChange={(e) => setForm({ ...form, country: e.target.value })}
                  placeholder="India"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Concierge / Reception Phone *
                </label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+91 40 2335 0101"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Hotel Email
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="concierge@yourhotel.com"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Official Website
                </label>
                <input
                  type="url"
                  value={form.website}
                  onChange={(e) => setForm({ ...form, website: e.target.value })}
                  placeholder="https://yourhotel.com"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 2: HOTEL SETTINGS & WI-FI (Direct match with requested feature & card)
            ========================================================================= */}
        {activeTab === "wifi" && (
          <div className="space-y-6 animate-in fade-in-50">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: Editable Wi-Fi Credentials Form */}
              <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Wifi className="w-4 h-4 text-indigo-600" />
                    <span>Manage Hotel Wi-Fi & QR Generation</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Update your guest Wi-Fi network and password. The system instantly generates a secure Wi-Fi QR code for in-room TVs and printed guest passes.
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                      Wi-Fi Network Name (SSID) *
                    </label>
                    <input
                      type="text"
                      value={wifiForm.networkName}
                      onChange={(e) => setWifiForm({ ...wifiForm, networkName: e.target.value })}
                      placeholder="e.g. SmartStay_Guest"
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                      Wi-Fi Password
                    </label>
                    <div className="relative">
                      <input
                        type={showWifiPassword ? "text" : "password"}
                        value={wifiForm.password}
                        onChange={(e) => setWifiForm({ ...wifiForm, password: e.target.value })}
                        placeholder="Enter guest Wi-Fi password"
                        className="w-full pl-3.5 pr-10 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowWifiPassword(!showWifiPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {showWifiPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                        Security Encryption
                      </label>
                      <select
                        value={wifiForm.securityType}
                        onChange={(e) => setWifiForm({ ...wifiForm, securityType: e.target.value as any })}
                        className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                      >
                        <option value="WPA2">WPA2 / WPA (Standard Hospitality)</option>
                        <option value="WPA3">WPA3 (High Security)</option>
                        <option value="nopass">Open Network (No Password)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                        Concierge Desk Phone
                      </label>
                      <input
                        type="text"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        placeholder="+91 40 2335 0101"
                        className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                      />
                    </div>
                  </div>

                  {/* Checkout Time & Quiet Hours - editable directly in Hotel Settings & Wi-Fi */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                        Standard Checkout Time
                      </label>
                      <input
                        type="text"
                        value={form.checkOutTime}
                        onChange={(e) => setForm({ ...form, checkOutTime: e.target.value })}
                        placeholder="e.g. 11:00 AM"
                        className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                      />
                      <div className="flex items-center gap-1.5 mt-1.5">
                        {["10:00 AM", "11:00 AM", "12:00 PM"].map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setForm({ ...form, checkOutTime: t })}
                            className={`px-2 py-0.5 text-[10px] font-semibold rounded-md border transition cursor-pointer ${
                              form.checkOutTime === t
                                ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                                : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
                            }`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                        Quiet Hours Schedule
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={form.quietHoursStart}
                          onChange={(e) => setForm({ ...form, quietHoursStart: e.target.value })}
                          placeholder="10:00 PM"
                          className="w-1/2 px-3 py-2.5 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 text-center font-medium"
                        />
                        <span className="text-slate-400 text-xs">to</span>
                        <input
                          type="text"
                          value={form.quietHoursEnd}
                          onChange={(e) => setForm({ ...form, quietHoursEnd: e.target.value })}
                          placeholder="7:00 AM"
                          className="w-1/2 px-3 py-2.5 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 text-center font-medium"
                        />
                      </div>
                      <span className="text-[10px] text-slate-400 mt-1 block">Displayed on guest TV banners</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between border-t border-slate-100">
                  <span className="text-xs text-slate-500">
                    Changes immediately reflect on Android TVs and Room QR codes.
                  </span>
                  <button
                    type="button"
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold text-white shadow-xs cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Wi-Fi & Hotel Settings</span>
                  </button>
                </div>
              </div>

              {/* Right Column: Exact Card matching User's Attached Screenshot & Live QR Pass */}
              <div className="space-y-4">
                {/* 1:1 Match of Image 1 & Image 3: "Hotel Settings & Wi-Fi" */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
                  <h3 className="text-base font-bold text-slate-900 mb-4">Hotel Settings & Wi-Fi</h3>
                  <div className="space-y-3.5 text-sm">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <span className="text-slate-500">Wi-Fi Network</span>
                      <span className="font-semibold text-slate-900">
                        {wifiForm.networkName || "Not configured"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <span className="text-slate-500">Checkout Time</span>
                      <span className="font-semibold text-slate-900">
                        {form.checkOutTime || "11:00 AM"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <span className="text-slate-500">Quiet Hours</span>
                      <span className="font-semibold text-slate-900">
                        {form.quietHoursStart} – {form.quietHoursEnd}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Concierge Desk</span>
                      <span className="font-semibold text-slate-900">
                        {form.phone || "Not configured"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Live Wi-Fi QR Card Pass */}
                <div className="bg-gradient-to-br from-indigo-50/80 via-white to-purple-50/50 rounded-2xl border border-indigo-100 p-6 shadow-xs text-center space-y-4">
                  <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-indigo-700 uppercase tracking-wider">
                    <QrCode className="w-4 h-4" />
                    <span>Instant Wi-Fi Connection QR</span>
                  </div>

                  <div className="inline-block p-4 bg-white rounded-2xl border border-indigo-100 shadow-sm">
                    <QRCodeSVG
                      value={liveQrString}
                      size={160}
                      level="M"
                      className="mx-auto"
                    />
                  </div>

                  <div>
                    <div className="font-bold text-slate-900 text-sm">{wifiForm.networkName || "SmartStay_Guest"}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {wifiForm.password ? `Password: ${wifiForm.password}` : "Open Network"}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-2">
                      Scan with any smartphone camera to automatically join the network without typing credentials.
                    </p>
                  </div>

                  <div className="flex items-center justify-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        window.print();
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5 text-slate-500" />
                      <span>Print QR Tent Card</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(liveQrString);
                        toast.success("Wi-Fi QR payload copied to clipboard");
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                      <span>Copy Payload</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* ══════════════ Hotel Amenities Management inside Settings ══════════════ */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    <span>In-Room TV Hotel Amenities</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Add or edit hotel amenities (Dining, Pool, Gym, Valet, Spa, etc.). Active amenities automatically appear on guest room TVs.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">
                    {hotelStore.amenities.filter((a) => a.isActive).length} active on TV
                  </span>
                </div>
              </div>

              {/* Quick 1-Click Presets */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Quick Add Popular Hospitality Amenities:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { name: "Dining", hours: "7 AM - 11 PM", icon: "utensils" },
                    { name: "Pool", hours: "6 AM - 9 PM", icon: "waves" },
                    { name: "Fitness Center", hours: "24/7", icon: "dumbbell" },
                    { name: "Valet Parking", hours: "Complimentary", icon: "car" },
                    { name: "Ayurvedic Spa", hours: "9 AM - 8 PM", icon: "sparkles" },
                    { name: "Room Service", hours: "Dial 9", icon: "bell" },
                    { name: "Breakfast Cafe", hours: "7 AM - 10:30 AM", icon: "coffee" },
                    { name: "Sky Lounge", hours: "5 PM - 1 AM", icon: "sparkles" },
                  ].map((preset) => {
                    const alreadyExists = hotelStore.amenities.some(
                      (a) => a.name.toLowerCase() === preset.name.toLowerCase()
                    );
                    return (
                      <button
                        key={preset.name}
                        type="button"
                        disabled={alreadyExists}
                        onClick={() => {
                          hotelStore.addAmenity(preset.name, preset.hours, preset.icon);
                          toast.success(`Added ${preset.name}`);
                        }}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium border transition cursor-pointer ${
                          alreadyExists
                            ? "bg-slate-50 border-slate-200 text-slate-400 opacity-60 cursor-not-allowed"
                            : "bg-white border-slate-200 text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/50"
                        }`}
                      >
                        <Plus className="w-3 h-3 text-indigo-500" />
                        <span>{preset.name}</span>
                        <span className="text-[10px] text-slate-400">({preset.hours})</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Add Custom Amenity Form Bar */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row items-center gap-3">
                <input
                  type="text"
                  placeholder="Custom Amenity Name (e.g. Executive Lounge)"
                  value={newAmenityName}
                  onChange={(e) => setNewAmenityName(e.target.value)}
                  className="w-full sm:flex-1 px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
                <input
                  type="text"
                  placeholder="Hours / Timings (e.g. 6 AM - 11 PM)"
                  value={newAmenityHours}
                  onChange={(e) => setNewAmenityHours(e.target.value)}
                  className="w-full sm:w-44 px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
                <select
                  value={newAmenityIcon}
                  onChange={(e) => setNewAmenityIcon(e.target.value)}
                  className="w-full sm:w-36 px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="sparkles">Sparkles / Luxury</option>
                  <option value="utensils">Dining / Restaurant</option>
                  <option value="waves">Pool / Spa</option>
                  <option value="dumbbell">Fitness / Gym</option>
                  <option value="coffee">Coffee / Breakfast</option>
                  <option value="car">Parking / Valet</option>
                  <option value="bell">Room Service</option>
                  <option value="wifi">Wi-Fi Lounge</option>
                </select>

                <button
                  type="button"
                  onClick={handleAddAmenity}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold text-white transition-all shadow-xs cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Amenity</span>
                </button>
              </div>

              {/* Amenities Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {hotelStore.amenities.map((item) => (
                  <div
                    key={item.id}
                    className={`p-3.5 rounded-xl border transition-all flex items-center justify-between ${
                      item.isActive
                        ? "bg-white border-slate-200 shadow-2xs"
                        : "bg-slate-50 border-dashed border-slate-300 opacity-60"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                        {renderAmenityIcon(item.icon)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 truncate">{item.name}</div>
                        <div className="text-[11px] text-slate-500 truncate">{item.hours || "Available"}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggleAmenity(item.id)}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase cursor-pointer ${
                          item.isActive
                            ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                        }`}
                      >
                        {item.isActive ? "Active" : "Off"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveAmenity(item.id)}
                        className="p-1 rounded text-slate-400 hover:text-rose-600 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 3: TIME & LOCALE
            ========================================================================= */}
        {activeTab === "time" && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5 animate-in fade-in-50">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Standard Schedule & Quiet Hours</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Configures default checkout deadlines and displays quiet hours notifications on TVs.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Standard Check-in Time
                </label>
                <input
                  type="text"
                  value={form.checkInTime}
                  onChange={(e) => setForm({ ...form, checkInTime: e.target.value })}
                  placeholder="e.g. 2:00 PM"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Standard Checkout Time
                </label>
                <input
                  type="text"
                  value={form.checkOutTime}
                  onChange={(e) => setForm({ ...form, checkOutTime: e.target.value })}
                  placeholder="e.g. 11:00 AM"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Quiet Hours Start
                </label>
                <input
                  type="text"
                  value={form.quietHoursStart}
                  onChange={(e) => setForm({ ...form, quietHoursStart: e.target.value })}
                  placeholder="10:00 PM"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Quiet Hours End
                </label>
                <input
                  type="text"
                  value={form.quietHoursEnd}
                  onChange={(e) => setForm({ ...form, quietHoursEnd: e.target.value })}
                  placeholder="7:00 AM"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Timezone
                </label>
                <input
                  type="text"
                  value={form.timezone}
                  onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 4: AMENITIES (Editable and Manageable by hotel)
            ========================================================================= */}
        {activeTab === "amenities" && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6 animate-in fade-in-50">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Hotel Amenities & Operating Hours</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Add, manage, and customize property amenities. Active amenities appear automatically in the interactive Smart TV screen carousel.
              </p>
            </div>

            {/* Add Amenity Bar */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row items-center gap-3">
              <input
                type="text"
                placeholder="Amenity name (e.g. Rooftop Infinity Pool)"
                value={newAmenityName}
                onChange={(e) => setNewAmenityName(e.target.value)}
                className="w-full sm:flex-1 px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
              <input
                type="text"
                placeholder="Hours (e.g. 6 AM - 10 PM)"
                value={newAmenityHours}
                onChange={(e) => setNewAmenityHours(e.target.value)}
                className="w-full sm:w-44 px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
              <select
                value={newAmenityIcon}
                onChange={(e) => setNewAmenityIcon(e.target.value)}
                className="w-full sm:w-36 px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
              >
                <option value="sparkles">Sparkles / Luxury</option>
                <option value="utensils">Dining / Restaurant</option>
                <option value="waves">Pool / Spa</option>
                <option value="dumbbell">Fitness / Gym</option>
                <option value="coffee">Coffee / Cafe</option>
                <option value="car">Parking / Valet</option>
                <option value="bell">Room Service</option>
                <option value="wifi">Wi-Fi Lounge</option>
              </select>

              <button
                type="button"
                onClick={handleAddAmenity}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold text-white transition-all shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Amenity</span>
              </button>
            </div>

            {/* Amenities Grid */}
            {hotelStore.amenities.length === 0 ? (
              <div className="p-8 text-center rounded-xl border border-dashed border-slate-200">
                <Sparkles className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <h4 className="text-sm font-semibold text-slate-800">No Amenities Added Yet</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  Add features like Swimming Pool, Fitness Center, Dining, or Spa so guests can discover them on their room TV.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {hotelStore.amenities.map((item) => (
                  <div
                    key={item.id}
                    className={`p-3.5 rounded-xl border transition-all flex items-center justify-between ${
                      item.isActive
                        ? "bg-white border-slate-200 shadow-2xs"
                        : "bg-slate-50 border-dashed border-slate-300 opacity-60"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                        {renderAmenityIcon(item.icon)}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900">{item.name}</div>
                        <div className="text-[11px] text-slate-500">{item.hours || "24/7"}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleToggleAmenity(item.id)}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase cursor-pointer ${
                          item.isActive
                            ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                        }`}
                      >
                        {item.isActive ? "Active" : "Off"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveAmenity(item.id)}
                        className="p-1 rounded text-slate-400 hover:text-rose-600 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* =========================================================================
            TAB 5: HOUSE RULES
            ========================================================================= */}
        {activeTab === "rules" && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6 animate-in fade-in-50">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Hotel Guidelines & House Rules</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Guests can view these policies on their in-room television under the Hotel Rules tab.
              </p>
            </div>

            {/* Add Rule Input */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Add a house rule (e.g. Pets are welcome in designated villa suites)..."
                value={newRuleText}
                onChange={(e) => setNewRuleText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddRule()}
                className="flex-1 px-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
              <button
                type="button"
                onClick={handleAddRule}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold text-white shadow-xs transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Rule</span>
              </button>
            </div>

            <div className="space-y-2">
              {form.houseRules.map((r, index) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-700"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 font-bold flex items-center justify-center text-[10px]">
                      {index + 1}
                    </span>
                    <span>{r.text}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveRule(r.id)}
                    className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 6: TV APPEARANCE
            ========================================================================= */}
        {activeTab === "tv" && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5 animate-in fade-in-50">
            <div>
              <h3 className="text-sm font-bold text-slate-900">In-Room Smart TV Experience</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Customize greeting banners, checkout notices, and ambient idle timeouts for televisions.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Guest Welcome Banner Greeting
              </label>
              <textarea
                rows={2}
                value={form.welcomeMessage}
                onChange={(e) => setForm({ ...form, welcomeMessage: e.target.value })}
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Checkout Morning Reminder Message
              </label>
              <textarea
                rows={2}
                value={form.checkoutMessage}
                onChange={(e) => setForm({ ...form, checkoutMessage: e.target.value })}
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            <div className="pt-2 border-t border-slate-100">
              <a
                href="/tv-preview"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-black text-xs font-semibold text-white shadow-xs transition"
              >
                <Tv className="w-3.5 h-3.5" />
                <span>Launch TV Simulator Preview</span>
              </a>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

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
  PhoneCall,
  Play,
  Edit2,
  X,
  Wine,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useHotelStore, buildWifiQrString, DEFAULT_AMENITIES } from "@/lib/hotelStore";
import { hotelApi, screensaverApi } from "@/lib/api";
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

  // Screensaver Settings State (Exactly 3 screensaver states)
  const [screensaverPreviewMode, setScreensaverPreviewMode] = useState<"DEFAULT" | "GUEST" | "CHECKOUT">("GUEST");
  const [screensaverForm, setScreensaverForm] = useState({
    isEnabled: true,
    idleTimeout: 300,
    showClock: true,
    showDate: true,
    showRoomNumber: true,
    showGuestName: true,
    showHotelLogo: true,
    showFacilities: true,
    showWeather: false,
    guestWelcomeTitle: "Welcome, {guestName}!",
    guestWelcomeSubtitle: "We hope you enjoy your comfortable stay with us.",
    guestPromoText: "Dial 9 for 24/7 Concierge and In-Room Dining.",
    defaultWelcomeTitle: "Welcome to {hotelName}",
    defaultWelcomeSubtitle: "Experience world-class luxury and personalized hospitality.",
    defaultPromoText: "High-speed Wi-Fi & 24/7 guest support available.",
  });

  const { data: serverScreensaver } = useQuery({
    queryKey: ["screensaver-config"],
    placeholderData: (prev) => prev,
    queryFn: async () => {
      try {
        return await screensaverApi.get();
      } catch {
        return null;
      }
    },
  });

  useEffect(() => {
    if (serverScreensaver) {
      setScreensaverForm({
        isEnabled: serverScreensaver.isEnabled ?? true,
        idleTimeout: serverScreensaver.idleTimeout ?? 300,
        showClock: serverScreensaver.showClock ?? true,
        showDate: serverScreensaver.showDate ?? true,
        showRoomNumber: serverScreensaver.showRoomNumber ?? true,
        showGuestName: serverScreensaver.showGuestName ?? true,
        showHotelLogo: serverScreensaver.showHotelLogo ?? true,
        showFacilities: serverScreensaver.showFacilities ?? true,
        showWeather: serverScreensaver.showWeather ?? false,
        guestWelcomeTitle: serverScreensaver.guestWelcomeTitle || "Welcome, {guestName}!",
        guestWelcomeSubtitle: serverScreensaver.guestWelcomeSubtitle || "We hope you enjoy your comfortable stay with us.",
        guestPromoText: serverScreensaver.guestPromoText || "Dial 9 for 24/7 Concierge and In-Room Dining.",
        defaultWelcomeTitle: serverScreensaver.defaultWelcomeTitle || "Welcome to {hotelName}",
        defaultWelcomeSubtitle: serverScreensaver.defaultWelcomeSubtitle || "Experience world-class luxury and personalized hospitality.",
        defaultPromoText: serverScreensaver.defaultPromoText || "High-speed Wi-Fi & 24/7 guest support available.",
      });
    }
  }, [serverScreensaver]);

  const updateScreensaverMutation = useMutation({
    mutationFn: async (data: any) => {
      return await screensaverApi.update(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["screensaver-config"] });
      toast.success("Screensaver Settings Saved", {
        description: "Idle timers, display toggles, and dual screensaver modes synchronized across all hotel TVs.",
      });
    },
    onError: (err: any) => {
      toast.error("Failed to save screensaver settings", {
        description: err.response?.data?.message || err.message,
      });
    },
  });

  const [newRuleText, setNewRuleText] = useState("");

  // New Amenity Modal / Form
  const [newAmenityName, setNewAmenityName] = useState("");
  const [newAmenityHours, setNewAmenityHours] = useState("");
  const [newAmenityIcon, setNewAmenityIcon] = useState("sparkles");

  // ═══════════════ IN-PLACE SIMULATION EDITING STATE & HANDLERS ═══════════════
  type SimFieldType =
    | "hotel_name"
    | "tagline"
    | "checkout_time"
    | "phone"
    | "quiet_hours"
    | "wifi"
    | "amenities"
    | "departure_reminders";

  const [activeSimModal, setActiveSimModal] = useState<SimFieldType | null>(null);
  const [isSavingSimField, setIsSavingSimField] = useState(false);

  // Draft state for in-place edits
  const [simDraftHotelName, setSimDraftHotelName] = useState("");
  const [simDraftTagline, setSimDraftTagline] = useState("");
  const [simDraftCheckoutTime, setSimDraftCheckoutTime] = useState("");
  const [simDraftPhone, setSimDraftPhone] = useState("");
  const [simDraftQuietStart, setSimDraftQuietStart] = useState("");
  const [simDraftQuietEnd, setSimDraftQuietEnd] = useState("");
  const [simDraftWifiSsid, setSimDraftWifiSsid] = useState("");
  const [simDraftWifiPass, setSimDraftWifiPass] = useState("");
  const [simDraftWifiSec, setSimDraftWifiSec] = useState<"WPA2" | "WPA3" | "WPA" | "nopass">("WPA2");

  // Amenities CRUD inside simulation
  const [simNewAmenityName, setSimNewAmenityName] = useState("");
  const [simNewAmenityHours, setSimNewAmenityHours] = useState("");
  const [simNewAmenityIcon, setSimNewAmenityIcon] = useState("sparkles");
  const [editingAmenityId, setEditingAmenityId] = useState<string | null>(null);
  const [editAmenityName, setEditAmenityName] = useState("");
  const [editAmenityHours, setEditAmenityHours] = useState("");
  const [editAmenityIcon, setEditAmenityIcon] = useState("sparkles");

  // Departure rules CRUD inside simulation
  const [simNewRuleText, setSimNewRuleText] = useState("");

  const openSimModal = (field: SimFieldType) => {
    if (field === "hotel_name") {
      setSimDraftHotelName(form.name || hotelStore.hotelName || "");
    } else if (field === "tagline") {
      setSimDraftTagline(form.tagline || hotelStore.tagline || "");
    } else if (field === "checkout_time") {
      setSimDraftCheckoutTime(form.checkOutTime || hotelStore.checkoutTime || "11:00 AM");
    } else if (field === "phone") {
      setSimDraftPhone(form.phone || hotelStore.conciergePhone || "");
    } else if (field === "quiet_hours") {
      setSimDraftQuietStart(form.quietHoursStart || hotelStore.quietHoursStart || "22:00");
      setSimDraftQuietEnd(form.quietHoursEnd || hotelStore.quietHoursEnd || "07:00");
    } else if (field === "wifi") {
      setSimDraftWifiSsid(wifiForm.networkName || hotelStore.wifiNetwork || "");
      setSimDraftWifiPass(wifiForm.password || hotelStore.wifiPassword || "");
      setSimDraftWifiSec(wifiForm.securityType || hotelStore.wifiSecurity || "WPA2");
    }
    setActiveSimModal(field);
  };

  const handleSaveSimField = async (field: SimFieldType) => {
    setIsSavingSimField(true);
    try {
      if (field === "hotel_name") {
        const val = simDraftHotelName.trim();
        if (!val) {
          toast.error("Hotel name cannot be empty");
          return;
        }
        await hotelApi.updateProfile({ name: val });
        setForm((prev) => ({ ...prev, name: val }));
        hotelStore.updateSettings({ hotelName: val });
        queryClient.invalidateQueries({ queryKey: ["hotel-profile"] });
        queryClient.invalidateQueries({ queryKey: ["hotel-settings"] });
        toast.success("Hotel Name updated and synced to all TVs!");
      } else if (field === "tagline") {
        const val = simDraftTagline.trim();
        await hotelApi.updateProfile({ tagline: val });
        setForm((prev) => ({ ...prev, tagline: val }));
        hotelStore.updateSettings({ tagline: val });
        queryClient.invalidateQueries({ queryKey: ["hotel-profile"] });
        toast.success("Hotel Subtitle / Tagline updated and synced to TVs!");
      } else if (field === "checkout_time") {
        const val = simDraftCheckoutTime.trim();
        await hotelApi.updateSettings({ checkOutTime: val });
        setForm((prev) => ({ ...prev, checkOutTime: val }));
        hotelStore.updateSettings({ checkoutTime: val });
        queryClient.invalidateQueries({ queryKey: ["hotel-settings"] });
        toast.success("Check-out time updated and synced to TVs!");
      } else if (field === "phone") {
        const val = simDraftPhone.trim();
        await hotelApi.updateProfile({ phone: val });
        setForm((prev) => ({ ...prev, phone: val }));
        hotelStore.updateSettings({ conciergePhone: val });
        queryClient.invalidateQueries({ queryKey: ["hotel-profile"] });
        toast.success("Front Desk Phone updated and synced to TVs!");
      } else if (field === "quiet_hours") {
        const start = simDraftQuietStart.trim();
        const end = simDraftQuietEnd.trim();
        await hotelApi.updateSettings({ quietHoursStart: start, quietHoursEnd: end });
        setForm((prev) => ({ ...prev, quietHoursStart: start, quietHoursEnd: end }));
        hotelStore.updateSettings({ quietHoursStart: start, quietHoursEnd: end });
        queryClient.invalidateQueries({ queryKey: ["hotel-settings"] });
        toast.success("Quiet Hours updated and synced to TVs!");
      } else if (field === "wifi") {
        const ssid = simDraftWifiSsid.trim();
        await hotelApi.updateWifi({
          networkName: ssid,
          password: simDraftWifiPass,
          securityType: simDraftWifiSec,
        });
        setWifiForm({
          networkName: ssid,
          password: simDraftWifiPass,
          securityType: simDraftWifiSec,
        });
        hotelStore.updateSettings({
          wifiNetwork: ssid,
          wifiPassword: simDraftWifiPass,
          wifiSecurity: simDraftWifiSec,
        });
        queryClient.invalidateQueries({ queryKey: ["hotel-settings"] });
        toast.success("Wi-Fi network & QR code updated on TVs!");
      } else if (field === "amenities") {
        await hotelApi.updateAmenities(hotelStore.amenities);
        queryClient.invalidateQueries({ queryKey: ["hotel-settings"] });
        toast.success("Hotel Amenities updated and synced to TVs!");
      } else if (field === "departure_reminders") {
        await hotelApi.updateHouseRules(form.houseRules);
        queryClient.invalidateQueries({ queryKey: ["hotel-settings"] });
        toast.success("Departure reminders updated and synced to TVs!");
      }
      setActiveSimModal(null);
    } catch (err: any) {
      toast.error("Failed to update setting", {
        description: err.response?.data?.message || err.message,
      });
    } finally {
      setIsSavingSimField(false);
    }
  };

  const handleSimAddAmenity = () => {
    if (!simNewAmenityName.trim()) {
      toast.error("Please enter amenity name");
      return;
    }
    hotelStore.addAmenity(
      simNewAmenityName.trim(),
      simNewAmenityHours.trim() || undefined,
      simNewAmenityIcon
    );
    setSimNewAmenityName("");
    setSimNewAmenityHours("");
    toast.success(`Added "${simNewAmenityName.trim()}"! Remember to click "Save & Sync"`);
  };

  const handleSimStartEditAmenity = (a: any) => {
    setEditingAmenityId(a.id);
    setEditAmenityName(a.name || "");
    setEditAmenityHours(a.hours || "");
    setEditAmenityIcon(a.icon || "sparkles");
  };

  const handleSimCommitEditAmenity = (id: string) => {
    if (!editAmenityName.trim()) {
      toast.error("Amenity name cannot be empty");
      return;
    }
    hotelStore.updateAmenity(id, {
      name: editAmenityName.trim(),
      hours: editAmenityHours.trim() || undefined,
      icon: editAmenityIcon,
    });
    setEditingAmenityId(null);
    toast.success("Amenity updated! Remember to click 'Save & Sync'");
  };

  const handleSimRemoveAmenity = (id: string) => {
    hotelStore.removeAmenity(id);
    toast.info("Amenity removed. Remember to click 'Save & Sync'");
  };

  const handleSimAddRule = () => {
    if (!simNewRuleText.trim()) return;
    const newRule = {
      id: `rule-${Date.now()}`,
      text: simNewRuleText.trim(),
      order: form.houseRules.length + 1,
    };
    setForm((prev) => ({
      ...prev,
      houseRules: [...prev.houseRules, newRule],
    }));
    setSimNewRuleText("");
    toast.success("Departure step added! Remember to click 'Save & Sync'");
  };

  const handleSimRemoveRule = (id: string) => {
    setForm((prev) => ({
      ...prev,
      houseRules: prev.houseRules.filter((r) => r.id !== id),
    }));
    toast.info("Step removed. Click 'Save & Sync' to persist.");
  };

  // Fetch from backend
  const { data: serverProfile, isLoading } = useQuery({
    queryKey: ["hotel-profile"],
    placeholderData: (prev) => prev,
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

      // 5. Update house rules in backend
      if (form.houseRules && form.houseRules.length > 0) {
        await hotelApi.updateHouseRules(form.houseRules);
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

              <div className="sm:col-span-2 pt-4 flex items-center justify-between border-t border-slate-100">
                <span className="text-xs text-slate-500">
                  Update your official hotel identity and guest contact information.
                </span>
                <button
                  type="button"
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold text-white shadow-xs cursor-pointer disabled:opacity-60"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{saveMutation.isPending ? "Saving..." : "Save Hotel Info"}</span>
                </button>
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

              <div className="sm:col-span-2 pt-4 flex items-center justify-between border-t border-slate-100">
                <span className="text-xs text-slate-500">
                  Timings are pushed dynamically to connected TV displays and check-in workflows.
                </span>
                <button
                  type="button"
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold text-white shadow-xs cursor-pointer disabled:opacity-60"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{saveMutation.isPending ? "Saving..." : "Save Time & Schedule"}</span>
                </button>
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

            <div className="pt-4 flex items-center justify-between border-t border-slate-100">
              <span className="text-xs text-slate-500">
                House rules display on TV guest greetings and screensavers.
              </span>
              <button
                type="button"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold text-white shadow-xs cursor-pointer disabled:opacity-60"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{saveMutation.isPending ? "Saving..." : "Save House Rules"}</span>
              </button>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 6: TV & SCREENSAVER SETTINGS
            ========================================================================= */}
        {activeTab === "tv" && (
          <div className="space-y-6 animate-in fade-in-50">
            {/* Top Config Card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Tv className="w-5 h-5 text-indigo-600" />
                    <span>In-Room TV & Automatic Screensaver Settings</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Configure intelligent idle timeouts, remote wake-up, and dual screen modes (Guest Occupied vs Hotel Default).
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <a
                    href="/tv-preview"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition"
                  >
                    <Tv className="w-3.5 h-3.5 text-indigo-600" />
                    <span>4K TV Simulator</span>
                  </a>

                  <button
                    onClick={() => updateScreensaverMutation.mutate(screensaverForm)}
                    disabled={updateScreensaverMutation.isPending}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold text-white shadow-md shadow-indigo-200 transition disabled:opacity-60 cursor-pointer"
                  >
                    {updateScreensaverMutation.isPending ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5" />
                        <span>Save Screensaver Settings</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Screensaver Global Activation & Idle Timeout */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 rounded-2xl bg-slate-50/70 border border-slate-200/80">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">
                      Automatic Idle Screensaver
                    </span>
                    <span className="text-[11px] text-slate-500 mt-0.5 block">
                      When active, TV screens switch to ambient screensaver after the specified idle duration, and wake instantly on any remote keypress.
                    </span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                    <input
                      type="checkbox"
                      checked={screensaverForm.isEnabled}
                      onChange={(e) =>
                        setScreensaverForm({ ...screensaverForm, isEnabled: e.target.checked })
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-900 mb-1">
                    Idle Activation Timeout
                  </label>
                  <select
                    value={screensaverForm.idleTimeout}
                    onChange={(e) =>
                      setScreensaverForm({
                        ...screensaverForm,
                        idleTimeout: Number(e.target.value),
                      })
                    }
                    className="w-full px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  >
                    <option value={60}>1 Minute (60 seconds) — Fast test</option>
                    <option value={120}>2 Minutes (120 seconds)</option>
                    <option value={300}>5 Minutes (300 seconds) — Recommended</option>
                    <option value={600}>10 Minutes (600 seconds)</option>
                    <option value={900}>15 Minutes (900 seconds)</option>
                    <option value={1200}>20 Minutes (1200 seconds)</option>
                    <option value={1800}>30 Minutes (1800 seconds)</option>
                  </select>
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Remote control D-pad clicks automatically reset this timer.
                  </span>
                </div>
              </div>

              {/* Display Element Toggles */}
              <div className="space-y-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 block">
                  Elements Displayed on TV Screensaver
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                  {[
                    { key: "showClock", label: "Digital Clock", icon: Clock },
                    { key: "showDate", label: "Date Display", icon: Clock },
                    { key: "showRoomNumber", label: "Room Badge", icon: Building2 },
                    { key: "showGuestName", label: "Guest Name", icon: Sparkles },
                    { key: "showHotelLogo", label: "Hotel Brand", icon: Building2 },
                    { key: "showFacilities", label: "Facilities Promo", icon: Bell },
                  ].map((item) => {
                    const checked = (screensaverForm as any)[item.key];
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() =>
                          setScreensaverForm({
                            ...screensaverForm,
                            [item.key]: !checked,
                          })
                        }
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                          checked
                            ? "border-indigo-300 bg-indigo-50/60 text-indigo-900 shadow-2xs"
                            : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <item.icon className={`w-4 h-4 ${checked ? "text-indigo-600" : "text-slate-400"}`} />
                          <span
                            className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-bold ${
                              checked ? "bg-indigo-600 text-white" : "border border-slate-300 text-transparent"
                            }`}
                          >
                            ✓
                          </span>
                        </div>
                        <span className="text-xs font-bold mt-2 block">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Dual Mode Template Editors */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
                {/* Mode 1: Guest Occupied Template */}
                <div className="p-4 rounded-2xl border border-indigo-100 bg-indigo-50/20 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700 text-[10px] font-bold uppercase tracking-wider">
                      Mode 1 (Guest Occupied)
                    </span>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Welcome Title Template
                    </label>
                    <input
                      type="text"
                      value={screensaverForm.guestWelcomeTitle}
                      onChange={(e) =>
                        setScreensaverForm({ ...screensaverForm, guestWelcomeTitle: e.target.value })
                      }
                      placeholder="Welcome, {guestName}!"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 font-semibold"
                    />
                    <span className="text-[10px] text-slate-400">
                      Use <code>{"{guestName}"}</code> for dynamic guest name replacement.
                    </span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Guest Subtitle
                    </label>
                    <input
                      type="text"
                      value={screensaverForm.guestWelcomeSubtitle}
                      onChange={(e) =>
                        setScreensaverForm({ ...screensaverForm, guestWelcomeSubtitle: e.target.value })
                      }
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Facilities &amp; Concierge Promo Banner
                    </label>
                    <input
                      type="text"
                      value={screensaverForm.guestPromoText}
                      onChange={(e) =>
                        setScreensaverForm({ ...screensaverForm, guestPromoText: e.target.value })
                      }
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>
                </div>

                {/* Mode 2: Default Unoccupied Template */}
                <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 text-[10px] font-bold uppercase tracking-wider">
                      Mode 2 (Default Unoccupied)
                    </span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Hotel Welcome Title
                    </label>
                    <input
                      type="text"
                      value={screensaverForm.defaultWelcomeTitle}
                      onChange={(e) =>
                        setScreensaverForm({ ...screensaverForm, defaultWelcomeTitle: e.target.value })
                      }
                      placeholder="Welcome to {hotelName}"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 font-semibold"
                    />
                    <span className="text-[10px] text-slate-400">
                      Use <code>{"{hotelName}"}</code> for dynamic property name.
                    </span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Hotel Subtitle
                    </label>
                    <input
                      type="text"
                      value={screensaverForm.defaultWelcomeSubtitle}
                      onChange={(e) =>
                        setScreensaverForm({ ...screensaverForm, defaultWelcomeSubtitle: e.target.value })
                      }
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Services / Wi-Fi Note Banner
                    </label>
                    <input
                      type="text"
                      value={screensaverForm.defaultPromoText}
                      onChange={(e) =>
                        setScreensaverForm({ ...screensaverForm, defaultPromoText: e.target.value })
                      }
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* ══════════════ DUAL INTERACTIVE 16:9 LIVE PREVIEWS ══════════════ */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Live 16:9 Screensaver Simulation
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Real-time visual preview of how in-room TVs render the idle screensaver in each state.
                  </p>
                </div>

                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setScreensaverPreviewMode("DEFAULT")}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                      screensaverPreviewMode === "DEFAULT"
                        ? "bg-white text-indigo-700 shadow-2xs font-bold"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    1. Welcome Hotel (Unoccupied)
                  </button>
                  <button
                    type="button"
                    onClick={() => setScreensaverPreviewMode("GUEST")}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                      screensaverPreviewMode === "GUEST"
                        ? "bg-white text-indigo-700 shadow-2xs font-bold"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    2. Welcome Customer (Occupied)
                  </button>
                  <button
                    type="button"
                    onClick={() => setScreensaverPreviewMode("CHECKOUT")}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                      screensaverPreviewMode === "CHECKOUT"
                        ? "bg-white text-indigo-700 shadow-2xs font-bold"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    3. Checkout Thank You
                  </button>
                </div>
              </div>

              {/* 16:9 Screen Canvas - Faithfully matching TV Display Simulator (tv-preview) */}
              <div className="relative aspect-video w-full max-w-4xl mx-auto rounded-2xl overflow-hidden border-4 border-slate-800 bg-[#070712] shadow-2xl p-5 md:p-7 flex flex-col justify-between text-white select-none">
                {/* Ambient glow */}
                <div className="absolute inset-0 bg-gradient-to-tr from-[#0a0a20] via-[#0d0d2b] to-[#14143a] opacity-90 pointer-events-none" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900/20 via-transparent to-transparent pointer-events-none" />

                {(() => {
                  const simHotelName = form.name || hotelStore.hotelName || "SmartStay Luxury Resort";
                  const simHotelTagline = form.tagline || hotelStore.tagline || "Experience world-class luxury and dedicated 24/7 guest services.";
                  const simGuestName = "Rahul Sharma";
                  const simCheckoutTime = form.checkOutTime || "11:00 AM";
                  const simQuietHours = `${form.quietHoursStart || "22:00"} – ${form.quietHoursEnd || "07:00"}`;
                  const simPhone = form.phone || hotelStore.conciergePhone || "+91 85559 72882";
                  const simWifiSsid = wifiForm.networkName || hotelStore.wifiNetwork || `${simHotelName.replace(/\s+/g, "_")}_Guest`;
                  const simWifiPass = wifiForm.password || hotelStore.wifiPassword || "";
                  const simWifiSecurity = wifiForm.securityType || hotelStore.wifiSecurity || "WPA2";
                  const simWifiQrString = buildWifiQrString(simWifiSsid, simWifiPass, simWifiSecurity);
                  const activeAmenitiesList = (hotelStore.amenities && hotelStore.amenities.length > 0)
                    ? hotelStore.amenities.filter((a) => a.isActive)
                    : DEFAULT_AMENITIES;

                  return (
                    <>
                      {/* ═══════════════ STATE 1: WELCOME HOTEL (Unoccupied) ═══════════════ */}
                      {screensaverPreviewMode === "DEFAULT" && (
                        <>
                          {/* Header */}
                          <div className="relative z-10 flex items-center justify-between pb-2 border-b border-white/10">
                            <div>
                              <span className="text-[10px] font-bold tracking-[0.15em] text-indigo-400 uppercase block">
                                WELCOME TO
                              </span>
                              <div
                                onClick={() => openSimModal("hotel_name")}
                                className="group/edit cursor-pointer p-1 -m-1 rounded-lg hover:bg-white/10 hover:ring-2 hover:ring-sky-400 hover:ring-dashed transition-all inline-block"
                                title="Click to edit Hotel Name"
                              >
                                <h1 className="text-xl md:text-2xl lg:text-3xl font-black text-white m-0 tracking-tight flex items-center gap-2">
                                  {simHotelName}
                                  <span className="opacity-0 group-hover/edit:opacity-100 transition-opacity text-[10px] bg-sky-500/80 text-white px-1.5 py-0.5 rounded font-mono font-normal flex items-center gap-1">
                                    <Edit2 className="w-2.5 h-2.5" /> Edit Name
                                  </span>
                                </h1>
                              </div>
                              <div
                                onClick={() => openSimModal("tagline")}
                                className="group/edit cursor-pointer p-1 -m-1 rounded-lg hover:bg-white/10 hover:ring-2 hover:ring-sky-400 hover:ring-dashed transition-all block max-w-md mt-0.5"
                                title="Click to edit Hotel Subtitle / Tagline"
                              >
                                <p className="text-[11px] text-slate-400 m-0 truncate flex items-center gap-1.5">
                                  <span>{simHotelTagline}</span>
                                  <span className="opacity-0 group-hover/edit:opacity-100 transition-opacity text-[9px] text-sky-400 font-mono flex items-center gap-0.5 shrink-0">
                                    <Edit2 className="w-2.5 h-2.5" /> Edit Subtitle
                                  </span>
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 backdrop-blur-md text-center">
                                <span className="text-[9px] uppercase tracking-wider text-slate-400 block font-semibold">
                                  SMART TV
                                </span>
                                <p className="text-base md:text-lg font-black text-white m-0">ROOM 101</p>
                              </div>
                              <div className="text-right">
                                <p className="text-base md:text-lg font-bold text-white m-0">
                                  {new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                                </p>
                                <p className="text-[10px] text-slate-400 m-0">
                                  {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* 3 Main Information Cards Grid */}
                          <div className="relative z-10 my-auto grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 items-stretch">
                            {/* Card 1: Property Overview */}
                            <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md flex flex-col justify-between overflow-hidden">
                              <div>
                                <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider">
                                  Hotel Hospitality
                                </span>
                                <div className="mt-2 space-y-2 text-[11px]">
                                  <p className="text-slate-300 m-0 line-clamp-2 leading-relaxed">
                                    Welcome to {simHotelName}. Our property features state-of-the-art guest rooms and 24/7 dedicated reception.
                                  </p>
                                  <div
                                    onClick={() => openSimModal("checkout_time")}
                                    className="group/edit cursor-pointer p-1 -m-1 rounded-lg hover:bg-white/10 hover:ring-1 hover:ring-sky-400 transition-all flex items-center gap-1.5 text-indigo-400 font-semibold"
                                    title="Click to edit Standard Check-out Time"
                                  >
                                    <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                                    <span>Standard Check-out: {simCheckoutTime}</span>
                                    <Edit2 className="w-2.5 h-2.5 text-sky-400 opacity-0 group-hover/edit:opacity-100 transition-opacity" />
                                  </div>
                                </div>
                              </div>
                              <div
                                onClick={() => openSimModal("phone")}
                                className="group/edit cursor-pointer p-1 -m-1 rounded-lg hover:bg-white/10 hover:ring-1 hover:ring-sky-400 transition-all pt-2 border-t border-white/10 text-[9px] text-slate-400 flex items-center justify-between"
                                title="Click to edit Front Desk Phone"
                              >
                                <span>Front Desk Direct: {simPhone}</span>
                                <span className="opacity-0 group-hover/edit:opacity-100 text-sky-400 text-[9px] flex items-center gap-0.5">
                                  <Edit2 className="w-2.5 h-2.5" /> Edit
                                </span>
                              </div>
                            </div>

                            {/* Card 2: Connected Wi-Fi (QR Only + "Connect WiFi") */}
                            <div
                              onClick={() => openSimModal("wifi")}
                              className="group/edit rounded-xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md flex flex-col items-center justify-center text-center overflow-hidden cursor-pointer hover:bg-white/10 hover:ring-2 hover:ring-sky-400 hover:ring-dashed transition-all relative"
                              title="Click to edit Wi-Fi Network & Password"
                            >
                              <div className="rounded-lg bg-white p-2 shadow-md shrink-0">
                                <QRCodeSVG value={simWifiQrString} size={80} level="M" />
                              </div>
                              <span className="text-xs font-bold text-white mt-2.5 tracking-wide flex items-center gap-1">
                                Connect WiFi
                                <Edit2 className="w-3 h-3 text-sky-400 opacity-0 group-hover/edit:opacity-100 transition-opacity" />
                              </span>
                              <span className="text-[9px] text-slate-400 mt-0.5 truncate max-w-[90%] font-mono">
                                {simWifiSsid}
                              </span>
                            </div>

                            {/* Card 3: Hotel Amenities */}
                            <div
                              onClick={() => openSimModal("amenities")}
                              className="group/edit rounded-xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md flex flex-col justify-between overflow-hidden cursor-pointer hover:bg-white/10 hover:ring-2 hover:ring-sky-400 hover:ring-dashed transition-all relative"
                              title="Click to customize Amenities (Full CRUD)"
                            >
                              <div className="flex items-center justify-between pb-1.5 border-b border-white/10">
                                <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1">
                                  HOTEL AMENITIES
                                  <Edit2 className="w-2.5 h-2.5 text-sky-400 opacity-0 group-hover/edit:opacity-100 transition-opacity" />
                                </span>
                                <span className="text-[9px] text-sky-400 font-semibold group-hover/edit:underline">
                                  Edit List
                                </span>
                              </div>
                              <div className="space-y-1.5 my-2 overflow-hidden">
                                {activeAmenitiesList.slice(0, 4).map((amenity: any) => (
                                  <div key={amenity.id} className="flex items-center justify-between gap-1.5 min-w-0">
                                    <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
                                      <div className="w-3.5 h-3.5 text-indigo-400 shrink-0">
                                        {renderAmenityIcon(amenity.icon)}
                                      </div>
                                      <span className="text-[11px] font-medium text-slate-200 truncate" title={amenity.name}>
                                        {amenity.name}
                                      </span>
                                    </div>
                                    {amenity.hours && (
                                      <span className="text-[9px] font-semibold text-indigo-300 px-1.5 py-0.5 rounded bg-indigo-900/40 border border-indigo-500/30 shrink-0 whitespace-nowrap">
                                        {amenity.hours}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                              <div className="pt-1.5 border-t border-white/10 text-[9px] text-slate-400">
                                Room Service: Dial 9 on in-room phone.
                              </div>
                            </div>
                          </div>

                          {/* Bottom Bar */}
                          <div className="relative z-10 pt-2 border-t border-white/10 flex items-center justify-between text-[10px] text-slate-400">
                            <div
                              onClick={() => openSimModal("quiet_hours")}
                              className="group/edit cursor-pointer p-1 -m-1 rounded-lg hover:bg-white/10 hover:ring-1 hover:ring-sky-400 transition-all flex items-center gap-1"
                              title="Click to edit Quiet Hours"
                            >
                              <span>Quiet Hours: {simQuietHours} • Reception Desk: {simPhone}</span>
                              <Edit2 className="w-2.5 h-2.5 text-sky-400 opacity-0 group-hover/edit:opacity-100 transition-opacity" />
                            </div>
                            <span className="text-white/40 tracking-wider">
                              Press any button on TV remote to wake screen
                            </span>
                          </div>
                        </>
                      )}

                      {/* ═══════════════ STATE 2: WELCOME CUSTOMER (Occupied) ═══════════════ */}
                      {screensaverPreviewMode === "GUEST" && (
                        <>
                          {/* Header */}
                          <div className="relative z-10 flex items-center justify-between pb-2 border-b border-white/10">
                            <div>
                              <div
                                onClick={() => openSimModal("hotel_name")}
                                className="group/edit cursor-pointer p-0.5 rounded hover:bg-white/10 hover:ring-2 hover:ring-sky-400 hover:ring-dashed transition-all inline-block"
                                title="Click to edit Hotel Name"
                              >
                                <p className="text-[10px] font-bold tracking-[0.15em] text-indigo-400 uppercase m-0 flex items-center gap-1">
                                  {simHotelName}
                                  <Edit2 className="w-2.5 h-2.5 text-sky-400 opacity-0 group-hover/edit:opacity-100 transition-opacity" />
                                </p>
                              </div>
                              <h1 className="text-xl md:text-2xl lg:text-3xl font-black text-white m-0 mt-0.5 tracking-tight">
                                Welcome, {simGuestName}!
                              </h1>
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 backdrop-blur-md text-center">
                                <span className="text-[9px] uppercase tracking-wider text-slate-400 block font-semibold">
                                  YOUR ROOM
                                </span>
                                <p className="text-base md:text-lg font-black text-white m-0">101</p>
                              </div>
                              <div className="text-right">
                                <p className="text-base md:text-lg font-bold text-white m-0">
                                  {new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                                </p>
                                <p className="text-[10px] text-slate-400 m-0">
                                  {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* 3 Main Information Cards Grid */}
                          <div className="relative z-10 my-auto grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 items-stretch">
                            {/* Card 1: Your Reservation */}
                            <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md flex flex-col justify-between overflow-hidden">
                              <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider">
                                YOUR RESERVATION
                              </span>
                              <div className="my-2 space-y-1.5 text-[11px]">
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Guest</span>
                                  <span className="font-semibold text-white truncate max-w-[60%]">{simGuestName}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Room</span>
                                  <span className="font-semibold text-white">101</span>
                                </div>
                                <div
                                  onClick={() => openSimModal("checkout_time")}
                                  className="group/edit cursor-pointer flex justify-between p-0.5 rounded hover:bg-white/10 hover:ring-1 hover:ring-sky-400 transition-all"
                                  title="Click to edit Checkout Time"
                                >
                                  <span className="text-slate-400">Checkout</span>
                                  <span className="font-semibold text-amber-300 flex items-center gap-1">
                                    By {simCheckoutTime}
                                    <Edit2 className="w-2.5 h-2.5 text-sky-400 opacity-0 group-hover/edit:opacity-100 transition-opacity" />
                                  </span>
                                </div>
                                <div
                                  onClick={() => openSimModal("phone")}
                                  className="group/edit cursor-pointer flex justify-between p-0.5 rounded hover:bg-white/10 hover:ring-1 hover:ring-sky-400 transition-all"
                                  title="Click to edit Front Desk Phone"
                                >
                                  <span className="text-slate-400">Front Desk</span>
                                  <span className="font-semibold text-white flex items-center gap-1">
                                    Dial 9
                                    <Edit2 className="w-2.5 h-2.5 text-sky-400 opacity-0 group-hover/edit:opacity-100 transition-opacity" />
                                  </span>
                                </div>
                              </div>
                              <div className="pt-2 border-t border-white/10 text-[9px] text-slate-400">
                                Need express checkout? Contact Reception.
                              </div>
                            </div>

                            {/* Card 2: In-Room Wi-Fi (QR Only + "Connect WiFi") */}
                            <div
                              onClick={() => openSimModal("wifi")}
                              className="group/edit rounded-xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md flex flex-col items-center justify-center text-center overflow-hidden cursor-pointer hover:bg-white/10 hover:ring-2 hover:ring-sky-400 hover:ring-dashed transition-all relative"
                              title="Click to edit In-Room Wi-Fi & QR code"
                            >
                              <div className="rounded-lg bg-white p-2 shadow-md shrink-0">
                                <QRCodeSVG value={simWifiQrString} size={80} level="M" />
                              </div>
                              <span className="text-xs font-bold text-white mt-2.5 tracking-wide flex items-center gap-1">
                                Connect WiFi
                                <Edit2 className="w-3 h-3 text-sky-400 opacity-0 group-hover/edit:opacity-100 transition-opacity" />
                              </span>
                              <span className="text-[9px] text-slate-400 mt-0.5 truncate max-w-[90%] font-mono">
                                {simWifiSsid}
                              </span>
                            </div>

                            {/* Card 3: Hotel Amenities */}
                            <div
                              onClick={() => openSimModal("amenities")}
                              className="group/edit rounded-xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md flex flex-col justify-between overflow-hidden cursor-pointer hover:bg-white/10 hover:ring-2 hover:ring-sky-400 hover:ring-dashed transition-all relative"
                              title="Click to customize Amenities (Full CRUD)"
                            >
                              <div className="flex items-center justify-between pb-1.5 border-b border-white/10">
                                <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1">
                                  HOTEL AMENITIES
                                  <Edit2 className="w-2.5 h-2.5 text-sky-400 opacity-0 group-hover/edit:opacity-100 transition-opacity" />
                                </span>
                                <span className="text-[9px] text-sky-400 font-semibold group-hover/edit:underline">
                                  Edit List
                                </span>
                              </div>
                              <div className="space-y-1.5 my-2 overflow-hidden">
                                {activeAmenitiesList.slice(0, 4).map((amenity: any) => (
                                  <div key={amenity.id} className="flex items-center justify-between gap-1.5 min-w-0">
                                    <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
                                      <div className="w-3.5 h-3.5 text-indigo-400 shrink-0">
                                        {renderAmenityIcon(amenity.icon)}
                                      </div>
                                      <span className="text-[11px] font-medium text-slate-200 truncate" title={amenity.name}>
                                        {amenity.name}
                                      </span>
                                    </div>
                                    {amenity.hours && (
                                      <span className="text-[9px] font-semibold text-indigo-300 px-1.5 py-0.5 rounded bg-indigo-900/40 border border-indigo-500/30 shrink-0 whitespace-nowrap">
                                        {amenity.hours}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                              <div className="pt-1.5 border-t border-white/10 text-[9px] text-slate-400">
                                Dial 9 for In-Room Dining &amp; Concierge
                              </div>
                            </div>
                          </div>

                          {/* Bottom Bar */}
                          <div className="relative z-10 pt-2 border-t border-white/10 flex items-center justify-between text-[10px] text-slate-400">
                            <div
                              onClick={() => openSimModal("quiet_hours")}
                              className="group/edit cursor-pointer p-1 -m-1 rounded-lg hover:bg-white/10 hover:ring-1 hover:ring-sky-400 transition-all flex items-center gap-1"
                              title="Click to edit Quiet Hours"
                            >
                              <span>Quiet Hours: {simQuietHours} • Reception / Front Desk: {simPhone}</span>
                              <Edit2 className="w-2.5 h-2.5 text-sky-400 opacity-0 group-hover/edit:opacity-100 transition-opacity" />
                            </div>
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white text-slate-900 text-[10px] font-bold shadow-xs">
                              <Play className="w-3 h-3 fill-indigo-600 text-indigo-600" />
                              <span>Press Select on Remote to Open TV Applications</span>
                            </div>
                          </div>
                        </>
                      )}

                      {/* ═══════════════ STATE 3: CHECKOUT THANK YOU (Stay Completed / Departure) ═══════════════ */}
                      {screensaverPreviewMode === "CHECKOUT" && (
                        <div className="relative z-10 flex flex-col justify-between h-full">
                          {/* Header */}
                          <div className="flex items-center justify-between pb-2 border-b border-white/10">
                            <div>
                              <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[10px] font-bold text-amber-300 border border-amber-500/30 uppercase tracking-wider inline-block">
                                CHECKOUT COMPLETE
                              </span>
                              <h1 className="text-xl md:text-2xl lg:text-3xl font-black text-white m-0 mt-1.5 tracking-tight">
                                Thank You for Staying with Us!
                              </h1>
                              <div
                                onClick={() => openSimModal("tagline")}
                                className="group/edit cursor-pointer p-0.5 rounded hover:bg-white/10 hover:ring-1 hover:ring-sky-400 transition-all inline-block mt-0.5"
                                title="Click to edit Subtitle"
                              >
                                <p className="text-[11px] text-slate-300 m-0 flex items-center gap-1">
                                  We hope you had a pleasant stay at {simHotelName}.
                                  <Edit2 className="w-2.5 h-2.5 text-sky-400 opacity-0 group-hover/edit:opacity-100 transition-opacity" />
                                </p>
                              </div>
                            </div>

                            <div className="text-right">
                              <p className="text-base md:text-lg font-bold text-white m-0">
                                {new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                              </p>
                              <p className="text-[10px] text-amber-400 font-semibold m-0">
                                Room 101 • Departure
                              </p>
                            </div>
                          </div>

                          {/* Numbered Departure Checklist Card */}
                          <div
                            onClick={() => openSimModal("departure_reminders")}
                            className="group/edit my-auto max-w-xl w-full mx-auto rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-md cursor-pointer hover:bg-white/10 hover:ring-2 hover:ring-sky-400 hover:ring-dashed transition-all"
                            title="Click to edit Departure Reminders (CRUD)"
                          >
                            <div className="flex items-center justify-between pb-1.5 border-b border-white/10 mb-2">
                              <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider m-0 flex items-center gap-1">
                                Departure Reminders
                                <Edit2 className="w-2.5 h-2.5 text-sky-400 opacity-0 group-hover/edit:opacity-100 transition-opacity" />
                              </p>
                              <span className="text-[9px] text-sky-400 font-semibold group-hover/edit:underline">
                                Edit Checklist
                              </span>
                            </div>
                            <div className="flex flex-col gap-2 text-[11px] text-slate-200">
                              {(form.houseRules && form.houseRules.length > 0 ? form.houseRules : DEFAULT_RULES).slice(0, 3).map((rule, idx) => (
                                <div key={rule.id || idx} className="flex items-center gap-2.5">
                                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold shrink-0 text-white">
                                    {idx + 1}
                                  </span>
                                  <span className="truncate">{rule.text}</span>
                                </div>
                              ))}
                            </div>

                            <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between text-[10px] text-slate-300">
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openSimModal("phone");
                                }}
                                className="group/edit cursor-pointer p-0.5 rounded hover:bg-white/10 hover:ring-1 hover:ring-sky-400 transition-all flex items-center gap-1.5"
                                title="Click to edit Reception Phone"
                              >
                                <PhoneCall className="w-3.5 h-3.5 text-indigo-400" />
                                <span>Need luggage or airport transfer assistance? Reception: {simPhone}</span>
                                <Edit2 className="w-2.5 h-2.5 text-sky-400 opacity-0 group-hover/edit:opacity-100 transition-opacity" />
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setScreensaverPreviewMode("DEFAULT");
                                }}
                                className="border border-white/20 bg-white/10 hover:bg-white/20 text-white rounded-lg px-2.5 py-1 text-[9px] font-semibold transition-all cursor-pointer"
                              >
                                Return to Welcome Screen
                              </button>
                            </div>
                          </div>

                          {/* Bottom Footer */}
                          <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[10px] text-slate-400">
                            <span>SmartStay TV • Safe Travels &amp; Have a Wonderful Journey</span>
                            <span className="text-white/40">
                              Reverting to Hotel Welcome Screen when room is prepared
                            </span>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════ IN-PLACE SIMULATION EDITING MODAL (CRUD) ═══════════════ */}
        {activeSimModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
              {/* Modal Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <Edit2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      {activeSimModal === "hotel_name" && "Edit Hotel Name"}
                      {activeSimModal === "tagline" && "Edit Hotel Subtitle / Tagline"}
                      {activeSimModal === "checkout_time" && "Edit Standard Check-out Time"}
                      {activeSimModal === "phone" && "Edit Front Desk Phone"}
                      {activeSimModal === "quiet_hours" && "Edit Quiet Hours Schedule"}
                      {activeSimModal === "wifi" && "Customize In-Room Wi-Fi & TV QR"}
                      {activeSimModal === "amenities" && "Manage Hotel Amenities (CRUD)"}
                      {activeSimModal === "departure_reminders" && "Customize Departure Reminders"}
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Changes persist immediately in database and synchronize with TV screens.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setActiveSimModal(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="space-y-4 py-1">
                {/* 1. Hotel Name */}
                {activeSimModal === "hotel_name" && (
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-700">Hotel Name *</label>
                    <input
                      type="text"
                      value={simDraftHotelName}
                      onChange={(e) => setSimDraftHotelName(e.target.value)}
                      placeholder="e.g. Grand Palace Hyderabad"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <p className="text-[11px] text-slate-400">
                      Primary property brand displayed across TV idle displays and guest welcome greetings.
                    </p>
                  </div>
                )}

                {/* 2. Hotel Subtitle / Tagline */}
                {activeSimModal === "tagline" && (
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-700">Hotel Subtitle / Tagline *</label>
                    <textarea
                      rows={3}
                      value={simDraftTagline}
                      onChange={(e) => setSimDraftTagline(e.target.value)}
                      placeholder="e.g. Experience world-class luxury and dedicated 24/7 guest services."
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <p className="text-[11px] text-slate-400">
                      Displays directly below the hotel title on idle screensavers when rooms are unoccupied.
                    </p>
                  </div>
                )}

                {/* 3. Check-out Time */}
                {activeSimModal === "checkout_time" && (
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-700">Standard Check-out Time *</label>
                    <input
                      type="text"
                      value={simDraftCheckoutTime}
                      onChange={(e) => setSimDraftCheckoutTime(e.target.value)}
                      placeholder="e.g. 11:00 AM"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <p className="text-[11px] text-slate-400">
                      Formatted check-out departure time rendered on TV screensavers.
                    </p>
                  </div>
                )}

                {/* 4. Phone */}
                {activeSimModal === "phone" && (
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-700">Front Desk Direct Phone *</label>
                    <input
                      type="text"
                      value={simDraftPhone}
                      onChange={(e) => setSimDraftPhone(e.target.value)}
                      placeholder="e.g. +91 85559 72884"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <p className="text-[11px] text-slate-400">
                      Shown to guests for front desk, reception, and luggage/checkout assistance.
                    </p>
                  </div>
                )}

                {/* 5. Quiet Hours */}
                {activeSimModal === "quiet_hours" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700">Quiet Hours Start</label>
                      <input
                        type="text"
                        value={simDraftQuietStart}
                        onChange={(e) => setSimDraftQuietStart(e.target.value)}
                        placeholder="e.g. 22:00 or 10:00 PM"
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700">Quiet Hours End</label>
                      <input
                        type="text"
                        value={simDraftQuietEnd}
                        onChange={(e) => setSimDraftQuietEnd(e.target.value)}
                        placeholder="e.g. 07:00 or 7:00 AM"
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                )}

                {/* 6. Wi-Fi & QR */}
                {activeSimModal === "wifi" && (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700">Wi-Fi Network Name (SSID) *</label>
                      <input
                        type="text"
                        value={simDraftWifiSsid}
                        onChange={(e) => setSimDraftWifiSsid(e.target.value)}
                        placeholder="e.g. GrandPalace_Guest"
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700">Wi-Fi Password</label>
                      <input
                        type="text"
                        value={simDraftWifiPass}
                        onChange={(e) => setSimDraftWifiPass(e.target.value)}
                        placeholder="Password (leave empty if open)"
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700">Security Encryption</label>
                      <select
                        value={simDraftWifiSec}
                        onChange={(e: any) => setSimDraftWifiSec(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                      >
                        <option value="WPA2">WPA2 / WPA3 (Recommended)</option>
                        <option value="WPA">WPA</option>
                        <option value="nopass">None (Open Network)</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* 7. Amenities (Full CRUD) */}
                {activeSimModal === "amenities" && (
                  <div className="space-y-4">
                    {/* Add New Amenity Bar */}
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block">
                        + Add New Amenity
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          type="text"
                          value={simNewAmenityName}
                          onChange={(e) => setSimNewAmenityName(e.target.value)}
                          placeholder="Amenity Name (e.g. Heated Pool)"
                          className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white"
                        />
                        <input
                          type="text"
                          value={simNewAmenityHours}
                          onChange={(e) => setSimNewAmenityHours(e.target.value)}
                          placeholder="Hours / Access (e.g. 24/7)"
                          className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white"
                        />
                        <select
                          value={simNewAmenityIcon}
                          onChange={(e) => setSimNewAmenityIcon(e.target.value)}
                          className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white"
                        >
                          <option value="sparkles">Sparkles / Luxury</option>
                          <option value="utensils">Restaurant / Dining</option>
                          <option value="waves">Pool / Spa</option>
                          <option value="dumbbell">Gym / Fitness</option>
                          <option value="car">Parking / Valet</option>
                          <option value="coffee">Coffee / Breakfast</option>
                          <option value="bell">Room Service</option>
                          <option value="wifi">Wi-Fi</option>
                        </select>
                      </div>
                      <button
                        type="button"
                        onClick={handleSimAddAmenity}
                        className="w-full py-1.5 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Amenity to List</span>
                      </button>
                    </div>

                    {/* Current Amenities List */}
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block">
                        Current Amenities ({hotelStore.amenities.length})
                      </span>
                      {hotelStore.amenities.map((a) => {
                        const isEditing = editingAmenityId === a.id;

                        if (isEditing) {
                          return (
                            <div key={a.id} className="p-2.5 rounded-xl border border-indigo-200 bg-indigo-50/50 space-y-2">
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <input
                                  type="text"
                                  value={editAmenityName}
                                  onChange={(e) => setEditAmenityName(e.target.value)}
                                  className="px-2 py-1 text-xs rounded-lg border border-slate-200 bg-white"
                                />
                                <input
                                  type="text"
                                  value={editAmenityHours}
                                  onChange={(e) => setEditAmenityHours(e.target.value)}
                                  className="px-2 py-1 text-xs rounded-lg border border-slate-200 bg-white"
                                />
                                <select
                                  value={editAmenityIcon}
                                  onChange={(e) => setEditAmenityIcon(e.target.value)}
                                  className="px-2 py-1 text-xs rounded-lg border border-slate-200 bg-white"
                                >
                                  <option value="sparkles">Sparkles</option>
                                  <option value="utensils">Dining</option>
                                  <option value="waves">Pool</option>
                                  <option value="dumbbell">Fitness</option>
                                  <option value="car">Parking</option>
                                  <option value="coffee">Coffee</option>
                                  <option value="bell">Room Service</option>
                                  <option value="wifi">Wi-Fi</option>
                                </select>
                              </div>
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setEditingAmenityId(null)}
                                  className="px-2.5 py-1 text-xs text-slate-500 hover:text-slate-700"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSimCommitEditAmenity(a.id)}
                                  className="px-3 py-1 rounded-lg bg-indigo-600 text-white text-xs font-semibold"
                                >
                                  Done
                                </button>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div
                            key={a.id}
                            className="flex items-center justify-between p-2 rounded-xl border border-slate-100 hover:bg-slate-50 text-xs transition-colors"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-5 h-5 rounded-md bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                                {renderAmenityIcon(a.icon)}
                              </div>
                              <div className="min-w-0">
                                <span className="font-semibold text-slate-800 block truncate">{a.name}</span>
                                {a.hours && <span className="text-[10px] text-slate-400 block truncate">{a.hours}</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => hotelStore.toggleAmenity(a.id)}
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-colors ${
                                  a.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                                }`}
                              >
                                {a.isActive ? "Active" : "Off"}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSimStartEditAmenity(a)}
                                className="p-1 rounded text-slate-400 hover:text-indigo-600 transition-colors"
                                title="Edit Amenity"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSimRemoveAmenity(a.id)}
                                className="p-1 rounded text-slate-400 hover:text-rose-600 transition-colors"
                                title="Delete Amenity"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 8. Departure Reminders */}
                {activeSimModal === "departure_reminders" && (
                  <div className="space-y-3">
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block">
                        + Add Departure Step
                      </span>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={simNewRuleText}
                          onChange={(e) => setSimNewRuleText(e.target.value)}
                          placeholder="e.g. Return room key cards to reception desk"
                          className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white"
                        />
                        <button
                          type="button"
                          onClick={handleSimAddRule}
                          className="py-1.5 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors"
                        >
                          Add
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2 max-h-56 overflow-y-auto">
                      {(form.houseRules || DEFAULT_RULES).map((rule, idx) => (
                        <div
                          key={rule.id || idx}
                          className="flex items-center justify-between p-2 rounded-xl border border-slate-100 hover:bg-slate-50 text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="w-5 h-5 rounded-full bg-indigo-600 text-white font-bold text-[10px] flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <span className="text-slate-700 text-xs truncate">{rule.text}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleSimRemoveRule(rule.id)}
                            className="p-1 rounded text-slate-400 hover:text-rose-600 shrink-0 ml-2"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setActiveSimModal(null)}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveSimField(activeSimModal)}
                  disabled={isSavingSimField}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                >
                  {isSavingSimField ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Save &amp; Sync to TVs</span>
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

"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import {
  Wifi,
  Sparkles,
  Utensils,
  Waves,
  Dumbbell,
  Car,
  Tv,
  Play,
  ArrowLeft,
  Coffee,
  Bell,
  RefreshCw,
  Wine,
  CheckCircle2,
  PhoneCall,
  Clock,
  ShieldCheck,
} from "lucide-react";
import { useHotelStore, buildWifiQrString } from "@/lib/hotelStore";
import { hotelApi, roomsApi, wifiApi, RoomDTO, WifiZoneDTO } from "@/lib/api";

// EXACTLY 3 SCREENSAVER STATES (+ PAIRING)
export type TvState = "WELCOME_HOTEL" | "WELCOME_CUSTOMER" | "CHECKOUT_THANKYOU" | "PAIRING";

function renderAmenityIcon(iconName: string) {
  const iconStyle = { width: "1rem", height: "1rem", color: "#818cf8", flexShrink: 0 };
  switch (iconName) {
    case "utensils":
      return <Utensils style={iconStyle} className="h-4 w-4 text-indigo-400 shrink-0" />;
    case "waves":
      return <Waves style={iconStyle} className="h-4 w-4 text-indigo-400 shrink-0" />;
    case "dumbbell":
      return <Dumbbell style={iconStyle} className="h-4 w-4 text-indigo-400 shrink-0" />;
    case "car":
      return <Car style={iconStyle} className="h-4 w-4 text-indigo-400 shrink-0" />;
    case "coffee":
      return <Coffee style={iconStyle} className="h-4 w-4 text-indigo-400 shrink-0" />;
    case "bell":
      return <Bell style={iconStyle} className="h-4 w-4 text-indigo-400 shrink-0" />;
    case "wifi":
      return <Wifi style={iconStyle} className="h-4 w-4 text-indigo-400 shrink-0" />;
    case "wine":
      return <Wine style={iconStyle} className="h-4 w-4 text-indigo-400 shrink-0" />;
    default:
      return <Sparkles style={iconStyle} className="h-4 w-4 text-indigo-400 shrink-0" />;
  }
}

export default function TvPreviewPage() {
  const [mounted, setMounted] = useState(false);
  const [screenState, setScreenState] = useState<TvState>("WELCOME_HOTEL");
  const [currentTime, setCurrentTime] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");
  const [customConnectedSsid, setCustomConnectedSsid] = useState<string>("");

  const hotelStore = useHotelStore();

  // Fetch hotel profile & rooms from backend
  const { data: serverProfile } = useQuery({
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

  const { data: serverRooms } = useQuery({
    queryKey: ["rooms"],
    placeholderData: (prev) => prev,
    queryFn: async () => {
      try {
        return await roomsApi.getAll();
      } catch {
        return [];
      }
    },
  });

  const { data: serverWifiZones } = useQuery({
    queryKey: ["wifi-zones"],
    placeholderData: (prev) => prev,
    queryFn: async () => {
      try {
        return await wifiApi.getAll();
      } catch {
        return [];
      }
    },
  });

  useEffect(() => {
    setMounted(true);
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const rooms: RoomDTO[] = Array.isArray(serverRooms) ? serverRooms : [];
  const activeRoom = rooms.find((r) => r.id === selectedRoomId) || rooms[0];

  useEffect(() => {
    if (activeRoom) {
      if (activeRoom.status === "OCCUPIED" && activeRoom.currentGuest) {
        setScreenState("WELCOME_CUSTOMER");
      } else {
        setScreenState("WELCOME_HOTEL");
      }
    }
  }, [activeRoom?.id, activeRoom?.status]);

  // Dynamic values
  const hotelName = serverProfile?.name || hotelStore.hotelName || "SmartStay Luxury Resort";
  const hotelTagline = serverProfile?.tagline || serverProfile?.description || hotelStore.tagline || "Experience world-class luxury and hospitality.";

  // Wi-Fi details: Connected Wi-Fi name should be TV connected Wi-Fi name
  // If that name matches any added Wi-Fi management name, QR should display password QR entered in Wi-Fi Management
  const roomWifiZone = (activeRoom as any)?.wifiZone;
  const wifiZonesList = Array.isArray(serverWifiZones) ? serverWifiZones : [];

  const defaultTvSsid =
    roomWifiZone?.ssid ||
    serverProfile?.wifiSettings?.networkName ||
    hotelStore.wifiNetwork ||
    `${hotelName.replace(/\s+/g, "_")}_Guest`;

  const tvConnectedSsid = customConnectedSsid.trim() || defaultTvSsid;

  // Search if tvConnectedSsid matches any configured zone in Wi-Fi Management
  const matchedZone = wifiZonesList.find(
    (z: any) => z.ssid?.toLowerCase() === tvConnectedSsid.toLowerCase()
  );

  const matchedHotelSettings =
    serverProfile?.wifiSettings?.networkName?.toLowerCase() === tvConnectedSsid.toLowerCase()
      ? serverProfile.wifiSettings
      : null;

  const isMatchedWithWifiManagement = Boolean(matchedZone || matchedHotelSettings);

  const wifiPassword =
    matchedZone?.password ||
    matchedHotelSettings?.password ||
    (isMatchedWithWifiManagement ? hotelStore.wifiPassword : "");

  const wifiSecurity =
    matchedZone?.securityType ||
    matchedZone?.security ||
    matchedHotelSettings?.securityType ||
    (isMatchedWithWifiManagement ? "WPA2" : "nopass");

  const wifiQrString = buildWifiQrString(tvConnectedSsid, wifiPassword, wifiSecurity);

  const checkoutTime = serverProfile?.settings?.checkOutTime || hotelStore.checkoutTime || "11:00 AM";
  const quietHours = `${serverProfile?.settings?.quietHoursStart || hotelStore.quietHoursStart || "10:00 PM"} – ${serverProfile?.settings?.quietHoursEnd || hotelStore.quietHoursEnd || "7:00 AM"}`;
  const conciergePhone = serverProfile?.phone || hotelStore.conciergePhone || "+91 40 2335 0101";

  // Dynamic active amenities: prioritize server amenities, then local store, then default
  const activeAmenities = (serverProfile?.amenities && Array.isArray(serverProfile.amenities) && serverProfile.amenities.length > 0)
    ? serverProfile.amenities
        .filter((a: any) => a.isActive !== false)
        .map((a: any) => ({
          id: a.id,
          name: a.customName || a.amenity?.name || "Amenity",
          icon: a.customIcon || a.amenity?.icon || "sparkles",
          hours: a.customName?.includes("(") ? a.customName.split("(")[1]?.replace(")", "") : undefined,
        }))
    : (hotelStore.amenities && hotelStore.amenities.length > 0)
    ? hotelStore.amenities.filter((a) => a.isActive)
    : [
        { id: "1", name: "Royal Dining", icon: "utensils", hours: "7 AM - 11 PM" },
        { id: "2", name: "Infinity Pool", icon: "waves", hours: "6 AM - 9 PM" },
        { id: "3", name: "Fitness Center", icon: "dumbbell", hours: "24/7" },
        { id: "4", name: "Valet Parking", icon: "car", hours: "Complimentary" },
        { id: "5", name: "Ayurvedic Spa", icon: "sparkles", hours: "9 AM - 8 PM" },
      ];

  const guestName = activeRoom?.currentGuest?.firstName
    ? `${activeRoom.currentGuest.firstName} ${activeRoom.currentGuest.lastName || ""}`.trim()
    : (activeRoom?.currentGuest?.name || "Rahul Sharma");

  const roomNumber = activeRoom?.number || "101";

  return (
    <div
      className="flex min-h-screen flex-col bg-[#05050A] text-white select-none"
      style={{
        backgroundColor: "#05050A",
        color: "#FFFFFF",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
      }}
    >
      {/* Top Controller Bar */}
      <div
        className="flex flex-wrap items-center justify-between border-b border-white/10 bg-[#0F0F1A] px-6 py-2.5 text-xs"
        style={{
          backgroundColor: "#0F0F1A",
          borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
          padding: "0.625rem 1.5rem",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
          fontSize: "0.75rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.375rem",
              borderRadius: "0.375rem",
              backgroundColor: "rgba(255, 255, 255, 0.1)",
              padding: "0.25rem 0.625rem",
              color: "#cbd5e1",
              textDecoration: "none",
            }}
          >
            <ArrowLeft style={{ width: "0.875rem", height: "0.875rem" }} />
            <span>Dashboard</span>
          </Link>
          <span style={{ fontWeight: 600, color: "#818cf8" }}>SmartStay TV Screensaver System</span>
          <span style={{ color: "#94a3b8" }}>• {hotelName} (Room {roomNumber})</span>
        </div>

        {/* Top Controls: Room Selector & Connected Wi-Fi Simulator */}
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          {rooms.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ color: "#94a3b8", fontSize: "0.6875rem" }}>Room:</span>
              <select
                value={activeRoom?.id || ""}
                onChange={(e) => setSelectedRoomId(e.target.value)}
                style={{
                  backgroundColor: "rgba(0,0,0,0.6)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  borderRadius: "0.375rem",
                  padding: "0.2rem 0.5rem",
                  fontSize: "0.75rem",
                  color: "#ffffff",
                }}
              >
                {rooms.map((r) => (
                  <option key={r.id} value={r.id} style={{ backgroundColor: "#1e1e2f", color: "#fff" }}>
                    Room {r.number} ({r.status})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Connected Wi-Fi Switcher / Tester */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
            <span style={{ color: "#94a3b8", fontSize: "0.6875rem" }}>Connected Wi-Fi:</span>
            <select
              value={customConnectedSsid || defaultTvSsid}
              onChange={(e) => setCustomConnectedSsid(e.target.value)}
              style={{
                backgroundColor: "rgba(0,0,0,0.6)",
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: "0.375rem",
                padding: "0.2rem 0.5rem",
                fontSize: "0.75rem",
                color: isMatchedWithWifiManagement ? "#86efac" : "#ffffff",
              }}
            >
              <option value={defaultTvSsid}>
                {defaultTvSsid} (TV Detected)
              </option>
              {wifiZonesList.map((z: any) => (
                <option key={z.id} value={z.ssid} style={{ backgroundColor: "#1e1e2f", color: "#fff" }}>
                  {z.ssid} ({z.name} in Wi-Fi Management)
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* State Toggle Buttons - EXACT 3 STATES */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.375rem",
            borderRadius: "0.5rem",
            backgroundColor: "rgba(0, 0, 0, 0.4)",
            padding: "0.25rem",
          }}
        >
          <span style={{ padding: "0 0.5rem", color: "#94a3b8", fontSize: "0.6875rem", fontWeight: 500 }}>
            Screensaver State:
          </span>
          {(
            [
              { id: "WELCOME_HOTEL", label: "1. Welcome Hotel (Unassigned)" },
              { id: "WELCOME_CUSTOMER", label: `2. Welcome Customer (${guestName})` },
              { id: "CHECKOUT_THANKYOU", label: "3. Checkout Thank You" },
              { id: "PAIRING", label: "Pairing Setup" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              onClick={() => setScreenState(item.id)}
              style={{
                borderRadius: "0.375rem",
                padding: "0.25rem 0.75rem",
                fontSize: "0.75rem",
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
                transition: "all 0.15s ease",
                backgroundColor: screenState === item.id ? "#4f46e5" : "transparent",
                color: screenState === item.id ? "#ffffff" : "#94a3b8",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* 16:9 TV Screen Display Container */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
        }}
      >
        <div
          style={{
            position: "relative",
            aspectRatio: "16 / 9",
            width: "100%",
            maxWidth: "76rem",
            overflow: "hidden",
            borderRadius: "1.25rem",
            border: "4px solid #222233",
            backgroundColor: "#0A0A14",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)",
          }}
        >
          {/* Ambient Gradient Background */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(135deg, #050510 0%, #0A0A1C 50%, #12122B 100%)",
              opacity: 0.95,
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "radial-gradient(circle at center, rgba(99, 102, 241, 0.12) 0%, transparent 70%)",
              pointerEvents: "none",
            }}
          />

          {/* ═══════════════ SCREENSAVER STATE 1: WELCOME HOTEL NAME (Unassigned / Unoccupied) ═══════════════ */}
          {screenState === "WELCOME_HOTEL" && (
            <div
              style={{
                position: "relative",
                display: "flex",
                height: "100%",
                flexDirection: "column",
                justifyContent: "space-between",
                padding: "2.5rem 3rem",
                boxSizing: "border-box",
              }}
            >
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <span style={{ fontSize: "0.8125rem", fontWeight: 700, letterSpacing: "0.15em", color: "#818cf8", textTransform: "uppercase" }}>
                    WELCOME TO
                  </span>
                  <h1 style={{ fontSize: "2.5rem", fontWeight: 900, color: "#ffffff", margin: "0.25rem 0 0 0", letterSpacing: "-0.025em" }}>
                    {hotelName}
                  </h1>
                  <p style={{ fontSize: "0.875rem", color: "#94a3b8", margin: "0.25rem 0 0 0", maxWidth: "34rem" }}>
                    {hotelTagline}
                  </p>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                  <div
                    style={{
                      borderRadius: "0.75rem",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      backgroundColor: "rgba(255, 255, 255, 0.05)",
                      padding: "0.5rem 1.25rem",
                      backdropFilter: "blur(12px)",
                      textAlign: "center",
                    }}
                  >
                    <span style={{ fontSize: "0.625rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "#94a3b8", display: "block" }}>
                      SMART TV
                    </span>
                    <p style={{ fontSize: "1.5rem", fontWeight: 900, color: "#ffffff", margin: 0 }}>
                      ROOM {roomNumber}
                    </p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0 }}>{currentTime || "10:30 AM"}</p>
                    <p style={{ fontSize: "0.75rem", color: "#94a3b8", margin: 0 }}>
                      {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                    </p>
                  </div>
                </div>
              </div>

              {/* 3 Main Information Cards Grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap: "1.5rem",
                  margin: "auto 0",
                  width: "100%",
                }}
              >
                {/* Card 1: Property Overview */}
                <div
                  style={{
                    borderRadius: "1rem",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    backgroundColor: "rgba(255, 255, 255, 0.05)",
                    padding: "1.25rem",
                    backdropFilter: "blur(12px)",
                    minWidth: 0,
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#a5b4fc", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Hotel Hospitality
                    </span>
                    <div style={{ marginTop: "0.75rem", display: "flex", flexDirection: "column", gap: "0.625rem", fontSize: "0.8125rem" }}>
                      <p style={{ color: "#cbd5e1", margin: 0, lineHeight: 1.4 }}>
                        Welcome to {hotelName}. Our property features state-of-the-art guest rooms and 24/7 dedicated reception.
                      </p>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#818cf8" }}>
                        <ShieldCheck style={{ width: "1rem", height: "1rem" }} />
                        <span style={{ fontWeight: 600 }}>Standard Check-out: {checkoutTime}</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ paddingTop: "0.75rem", borderTop: "1px solid rgba(255, 255, 255, 0.08)", fontSize: "0.75rem", color: "#94a3b8" }}>
                    Front Desk Direct: {conciergePhone}
                  </div>
                </div>

                {/* Card 2: Connected Wi-Fi (ONLY QR code + "Connect WiFi" centered directly below) */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    textAlign: "center",
                    borderRadius: "1rem",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    backgroundColor: "rgba(255, 255, 255, 0.05)",
                    padding: "1.25rem",
                    backdropFilter: "blur(12px)",
                    minWidth: 0,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      borderRadius: "0.75rem",
                      backgroundColor: "#ffffff",
                      padding: "0.5rem",
                      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                      flexShrink: 0,
                    }}
                  >
                    <QRCodeSVG
                      value={wifiQrString}
                      size={105}
                      level="M"
                    />
                  </div>
                  <span
                    style={{
                      fontSize: "1rem",
                      fontWeight: 700,
                      color: "#ffffff",
                      marginTop: "0.75rem",
                      letterSpacing: "0.05em",
                    }}
                  >
                    Connect WiFi
                  </span>
                </div>

                {/* Card 3: Hotel Amenities (Clean single column with text ellipsis - NO OVERFLOW) */}
                <div
                  style={{
                    borderRadius: "1rem",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    backgroundColor: "rgba(255, 255, 255, 0.05)",
                    padding: "1.25rem",
                    backdropFilter: "blur(12px)",
                    minWidth: 0,
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#a5b4fc", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      HOTEL AMENITIES
                    </span>
                    <span style={{ fontSize: "0.625rem", color: "#64748b", textTransform: "uppercase" }}>
                      Property Features
                    </span>
                  </div>

                  <div
                    style={{
                      marginTop: "0.625rem",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.45rem",
                      minWidth: 0,
                      overflow: "hidden",
                    }}
                  >
                    {activeAmenities.slice(0, 4).map((amenity: { id: string; name: string; icon: string; hours?: string }) => (
                      <div
                        key={amenity.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "0.5rem",
                          minWidth: 0,
                          width: "100%",
                          overflow: "hidden",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0, flex: 1, overflow: "hidden" }}>
                          {renderAmenityIcon(amenity.icon)}
                          <span
                            style={{
                              fontSize: "0.8125rem",
                              fontWeight: 600,
                              color: "#f1f5f9",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              minWidth: 0,
                            }}
                            title={amenity.name}
                          >
                            {amenity.name}
                          </span>
                        </div>
                        {amenity.hours && (
                          <span
                            style={{
                              fontSize: "0.6875rem",
                              fontWeight: 500,
                              color: "#c7d2fe",
                              backgroundColor: "rgba(99, 102, 241, 0.18)",
                              padding: "0.125rem 0.4rem",
                              borderRadius: "0.375rem",
                              flexShrink: 0,
                              whiteSpace: "nowrap",
                              border: "1px solid rgba(99, 102, 241, 0.25)",
                            }}
                          >
                            {amenity.hours}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  <p style={{ margin: "0.5rem 0 0 0", fontSize: "0.6875rem", color: "#64748b" }}>
                    Room Service: Dial 9 on in-room phone.
                  </p>
                </div>
              </div>

              {/* Bottom Remote & Wakeup Bar */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderTop: "1px solid rgba(255, 255, 255, 0.1)",
                  paddingTop: "1rem",
                  fontSize: "0.75rem",
                  color: "#94a3b8",
                }}
              >
                <span>Quiet Hours: {quietHours} • Reception Desk: {conciergePhone}</span>
                <span style={{ color: "rgba(255, 255, 255, 0.4)", letterSpacing: "0.05em" }}>
                  Press any button on TV remote to wake screen
                </span>
              </div>
            </div>
          )}

          {/* ═══════════════ SCREENSAVER STATE 2: WELCOME CUSTOMER NAME (Assigned / Occupied) ═══════════════ */}
          {screenState === "WELCOME_CUSTOMER" && (
            <div
              style={{
                position: "relative",
                display: "flex",
                height: "100%",
                flexDirection: "column",
                justifyContent: "space-between",
                padding: "2.5rem 3rem",
                boxSizing: "border-box",
              }}
            >
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <p style={{ fontSize: "0.875rem", fontWeight: 700, letterSpacing: "0.15em", color: "#818cf8", textTransform: "uppercase", margin: 0 }}>
                    {hotelName}
                  </p>
                  <h1 style={{ fontSize: "2.75rem", fontWeight: 900, letterSpacing: "-0.025em", color: "#ffffff", margin: "0.25rem 0 0 0" }}>
                    Welcome, {guestName}!
                  </h1>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                  <div
                    style={{
                      borderRadius: "0.75rem",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      backgroundColor: "rgba(255, 255, 255, 0.05)",
                      padding: "0.5rem 1.25rem",
                      backdropFilter: "blur(12px)",
                      textAlign: "center",
                    }}
                  >
                    <span style={{ fontSize: "0.625rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "#94a3b8", display: "block" }}>
                      YOUR ROOM
                    </span>
                    <p style={{ fontSize: "1.5rem", fontWeight: 900, color: "#ffffff", margin: 0 }}>
                      {roomNumber}
                    </p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0 }}>{currentTime || "10:30 AM"}</p>
                    <p style={{ fontSize: "0.75rem", color: "#94a3b8", margin: 0 }}>
                      {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                    </p>
                  </div>
                </div>
              </div>

              {/* 3 Main Information Cards Grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap: "1.5rem",
                  margin: "auto 0",
                  width: "100%",
                }}
              >
                {/* Stay Reservation Card */}
                <div
                  style={{
                    borderRadius: "1rem",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    backgroundColor: "rgba(255, 255, 255, 0.05)",
                    padding: "1.25rem",
                    backdropFilter: "blur(12px)",
                    minWidth: 0,
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                  }}
                >
                  <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#a5b4fc", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Your Reservation
                  </span>
                  <div style={{ marginTop: "0.75rem", display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.8125rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#94a3b8" }}>Guest</span>
                      <span style={{ fontWeight: 600, color: "#ffffff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "60%" }}>
                        {guestName}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#94a3b8" }}>Room</span>
                      <span style={{ fontWeight: 600, color: "#ffffff" }}>{roomNumber}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#94a3b8" }}>Checkout</span>
                      <span style={{ fontWeight: 600, color: "#fcd34d" }}>By {checkoutTime}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#94a3b8" }}>Front Desk</span>
                      <span style={{ fontWeight: 600, color: "#ffffff" }}>Dial 9</span>
                    </div>
                  </div>
                  <div style={{ paddingTop: "0.625rem", borderTop: "1px solid rgba(255, 255, 255, 0.08)", fontSize: "0.6875rem", color: "#64748b" }}>
                    Need express checkout? Contact Reception.
                  </div>
                </div>

                {/* In-Room Wi-Fi Card (ONLY QR Code + "Connect WiFi" centered directly below) */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    textAlign: "center",
                    borderRadius: "1rem",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    backgroundColor: "rgba(255, 255, 255, 0.05)",
                    padding: "1.25rem",
                    backdropFilter: "blur(12px)",
                    minWidth: 0,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      borderRadius: "0.75rem",
                      backgroundColor: "#ffffff",
                      padding: "0.5rem",
                      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                      flexShrink: 0,
                    }}
                  >
                    <QRCodeSVG
                      value={wifiQrString}
                      size={105}
                      level="M"
                    />
                  </div>
                  <span
                    style={{
                      fontSize: "1rem",
                      fontWeight: 700,
                      color: "#ffffff",
                      marginTop: "0.75rem",
                      letterSpacing: "0.05em",
                    }}
                  >
                    Connect WiFi
                  </span>
                </div>

                {/* Hotel Amenities Card (Properly constrained: NO OVERFLOW) */}
                <div
                  style={{
                    borderRadius: "1rem",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    backgroundColor: "rgba(255, 255, 255, 0.05)",
                    padding: "1.25rem",
                    backdropFilter: "blur(12px)",
                    minWidth: 0,
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#a5b4fc", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      HOTEL AMENITIES
                    </span>
                    <span style={{ fontSize: "0.625rem", color: "#64748b", textTransform: "uppercase" }}>
                      Guest Services
                    </span>
                  </div>

                  <div
                    style={{
                      marginTop: "0.625rem",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.45rem",
                      minWidth: 0,
                      overflow: "hidden",
                    }}
                  >
                    {activeAmenities.slice(0, 4).map((amenity: { id: string; name: string; icon: string; hours?: string }) => (
                      <div
                        key={amenity.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "0.5rem",
                          minWidth: 0,
                          width: "100%",
                          overflow: "hidden",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0, flex: 1, overflow: "hidden" }}>
                          {renderAmenityIcon(amenity.icon)}
                          <span
                            style={{
                              fontSize: "0.8125rem",
                              fontWeight: 600,
                              color: "#f1f5f9",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              minWidth: 0,
                            }}
                            title={amenity.name}
                          >
                            {amenity.name}
                          </span>
                        </div>

                        {amenity.hours && (
                          <span
                            style={{
                              fontSize: "0.6875rem",
                              fontWeight: 500,
                              color: "#c7d2fe",
                              backgroundColor: "rgba(99, 102, 241, 0.18)",
                              padding: "0.125rem 0.4rem",
                              borderRadius: "0.375rem",
                              flexShrink: 0,
                              whiteSpace: "nowrap",
                              border: "1px solid rgba(99, 102, 241, 0.25)",
                            }}
                          >
                            {amenity.hours}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.6875rem", color: "#94a3b8", marginTop: "0.5rem" }}>
                    <span>Dial 9 for In-Room Dining &amp; Concierge</span>
                  </div>
                </div>
              </div>

              {/* Bottom Remote & Entertainment Bar */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderTop: "1px solid rgba(255, 255, 255, 0.1)",
                  paddingTop: "1rem",
                  fontSize: "0.75rem",
                  color: "#94a3b8",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                  <span>Quiet Hours: {quietHours}</span>
                  <span>•</span>
                  <span>Reception / Front Desk: {conciergePhone}</span>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    borderRadius: "0.75rem",
                    backgroundColor: "#ffffff",
                    padding: "0.375rem 0.875rem",
                    fontWeight: 700,
                    color: "#030712",
                    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                  }}
                >
                  <Play style={{ width: "0.875rem", height: "0.875rem", fill: "#4f46e5", color: "#4f46e5" }} />
                  <span>Press Select on Remote to Open TV Applications</span>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════ SCREENSAVER STATE 3: CHECKOUT THANK YOU (Stay Completed / Departure) ═══════════════ */}
          {screenState === "CHECKOUT_THANKYOU" && (
            <div
              style={{
                position: "relative",
                display: "flex",
                height: "100%",
                flexDirection: "column",
                justifyContent: "space-between",
                padding: "2.5rem 3rem",
                boxSizing: "border-box",
              }}
            >
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <span
                    style={{
                      borderRadius: "9999px",
                      backgroundColor: "rgba(245, 158, 11, 0.2)",
                      padding: "0.25rem 0.75rem",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      color: "#fcd34d",
                      border: "1px solid rgba(245, 158, 11, 0.3)",
                    }}
                  >
                    CHECKOUT COMPLETE
                  </span>
                  <h1 style={{ fontSize: "2.5rem", fontWeight: 900, color: "#ffffff", margin: "0.5rem 0 0 0" }}>
                    Thank You for Staying with Us!
                  </h1>
                  <p style={{ fontSize: "0.875rem", color: "#cbd5e1", margin: "0.25rem 0 0 0" }}>
                    We hope you had a pleasant stay at {hotelName}.
                  </p>
                </div>

                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0 }}>{currentTime || "11:00 AM"}</p>
                  <p style={{ fontSize: "0.75rem", color: "#fbbf24", fontWeight: 600, margin: 0 }}>Room {roomNumber} • Departure</p>
                </div>
              </div>

              {/* Numbered Departure Checklist Card */}
              <div
                style={{
                  margin: "auto 0",
                  maxWidth: "46rem",
                  width: "100%",
                  borderRadius: "1rem",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  backgroundColor: "rgba(255, 255, 255, 0.05)",
                  padding: "1.5rem",
                  backdropFilter: "blur(12px)",
                  boxSizing: "border-box",
                }}
              >
                <p style={{ fontSize: "0.75rem", fontWeight: 700, color: "#a5b4fc", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 1rem 0" }}>
                  Departure Reminders
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", fontSize: "0.875rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <span style={{ display: "flex", height: "1.5rem", width: "1.5rem", alignItems: "center", justifyContent: "center", borderRadius: "9999px", backgroundColor: "#4f46e5", fontSize: "0.75rem", fontWeight: 700, flexShrink: 0 }}>
                      1
                    </span>
                    <span>Please check the room and safe for all personal belongings and chargers.</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <span style={{ display: "flex", height: "1.5rem", width: "1.5rem", alignItems: "center", justifyContent: "center", borderRadius: "9999px", backgroundColor: "#4f46e5", fontSize: "0.75rem", fontWeight: 700, flexShrink: 0 }}>
                      2
                    </span>
                    <span>Switch off the air conditioner, lights, and ensure faucets are closed.</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <span style={{ display: "flex", height: "1.5rem", width: "1.5rem", alignItems: "center", justifyContent: "center", borderRadius: "9999px", backgroundColor: "#4f46e5", fontSize: "0.75rem", fontWeight: 700, flexShrink: 0 }}>
                      3
                    </span>
                    <span>Hand over your room key card at the front desk / reception box.</span>
                  </div>
                </div>

                <div style={{ marginTop: "1.25rem", paddingTop: "1rem", borderTop: "1px solid rgba(255, 255, 255, 0.1)", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.75rem", color: "#cbd5e1" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <PhoneCall style={{ width: "0.875rem", height: "0.875rem", color: "#818cf8" }} />
                    <span>Need luggage or airport transfer assistance? Reception: {conciergePhone}</span>
                  </div>
                  <button
                    onClick={() => setScreenState("WELCOME_HOTEL")}
                    style={{
                      border: "1px solid rgba(255, 255, 255, 0.2)",
                      backgroundColor: "rgba(255, 255, 255, 0.1)",
                      color: "#ffffff",
                      borderRadius: "0.5rem",
                      padding: "0.25rem 0.625rem",
                      fontSize: "0.6875rem",
                      cursor: "pointer",
                    }}
                  >
                    Return to Welcome Screen
                  </button>
                </div>
              </div>

              {/* Bottom Footer */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderTop: "1px solid rgba(255, 255, 255, 0.1)",
                  paddingTop: "1rem",
                  fontSize: "0.75rem",
                  color: "#94a3b8",
                }}
              >
                <p style={{ margin: 0 }}>SmartStay TV • Safe Travels &amp; Have a Wonderful Journey</p>
                <span style={{ color: "rgba(255, 255, 255, 0.4)" }}>
                  Reverting to Hotel Welcome Screen when room is prepared
                </span>
              </div>
            </div>
          )}

          {/* ═══════════════ PAIRING SCREEN (First Time Boot Only) ═══════════════ */}
          {screenState === "PAIRING" && (
            <div
              style={{
                position: "relative",
                display: "flex",
                height: "100%",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "3rem",
                textAlign: "center",
                boxSizing: "border-box",
              }}
            >
              <div
                style={{
                  display: "flex",
                  height: "4rem",
                  width: "4rem",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "1rem",
                  backgroundColor: "#4f46e5",
                  color: "#ffffff",
                  boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)",
                }}
              >
                <Tv style={{ width: "2rem", height: "2rem" }} />
              </div>

              <h2 style={{ fontSize: "1.875rem", fontWeight: 900, color: "#ffffff", margin: "1rem 0 0 0" }}>Connect This TV to {hotelName}</h2>
              <p style={{ fontSize: "0.875rem", color: "#94a3b8", margin: "0.25rem 0 0 0", maxWidth: "28rem" }}>
                Enter this 6-digit code in your hotel dashboard under Rooms &gt; Pair TV. Once paired, the TV permanently links to this room:
              </p>

              {/* 6-character Code Card */}
              <div
                style={{
                  margin: "1.5rem 0",
                  display: "flex",
                  alignItems: "center",
                  gap: "1.5rem",
                  borderRadius: "1rem",
                  border: "1px solid rgba(99, 102, 241, 0.4)",
                  backgroundColor: "rgba(49, 46, 129, 0.4)",
                  padding: "1.25rem 2rem",
                  backdropFilter: "blur(12px)",
                }}
              >
                <div>
                  <span style={{ fontSize: "0.6875rem", fontWeight: 700, color: "#818cf8", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    PAIRING CODE
                  </span>
                  <p style={{ fontFamily: "monospace", fontSize: "3rem", fontWeight: 900, letterSpacing: "0.1em", color: "#ffffff", margin: "0.25rem 0 0 0" }}>
                    {activeRoom?.device?.pairingCode || "482193"}
                  </p>
                </div>

                <div style={{ height: "3.5rem", width: "1px", backgroundColor: "rgba(255, 255, 255, 0.1)" }} />

                <div style={{ borderRadius: "0.75rem", backgroundColor: "#ffffff", padding: "0.5rem" }}>
                  <QRCodeSVG
                    value={`smartstaytv://pair?code=${activeRoom?.device?.pairingCode || "482193"}`}
                    size={64}
                  />
                </div>
              </div>

              <p style={{ fontSize: "0.75rem", color: "#64748b", margin: 0 }}>
                Room {roomNumber} • Persistent one-to-one assignment
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

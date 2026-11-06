"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import {
  Wifi,
  Clock,
  Phone,
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
} from "lucide-react";
import { useHotelStore, buildWifiQrString } from "@/lib/hotelStore";
import { hotelApi, roomsApi, RoomDTO } from "@/lib/api";

type TvState = "GUEST_ACTIVE" | "DEFAULT_MODE" | "CHECKOUT_DAY" | "SCREENSAVER" | "PAIRING";

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
  const [screenState, setScreenState] = useState<TvState>("DEFAULT_MODE");
  const [currentTime, setCurrentTime] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");

  const hotelStore = useHotelStore();

  // Fetch hotel profile & rooms from backend
  const { data: serverProfile } = useQuery({
    queryKey: ["hotel-profile"],
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
    queryFn: async () => {
      try {
        return await roomsApi.getAll();
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
        setScreenState("GUEST_ACTIVE");
      } else {
        setScreenState("DEFAULT_MODE");
      }
    }
  }, [activeRoom?.id, activeRoom?.status]);

  // Dynamic values
  const hotelName = serverProfile?.name || hotelStore.hotelName || "SmartStay Luxury Resort";
  const hotelTagline = serverProfile?.tagline || serverProfile?.description || hotelStore.tagline || "Welcome to our hospitality experience";
  const wifiNetwork = serverProfile?.wifiSettings?.networkName || hotelStore.wifiNetwork || `${hotelName.replace(/\s+/g, "_")}_Guest`;
  const wifiPassword = serverProfile?.wifiSettings?.password || hotelStore.wifiPassword || "";
  const wifiSecurity = (serverProfile?.wifiSettings?.securityType as any) || hotelStore.wifiSecurity || "WPA2";
  const wifiQrString = buildWifiQrString(wifiNetwork, wifiPassword, wifiSecurity);

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
        { id: "1", name: "Dining", icon: "utensils", hours: "7 AM - 11 PM" },
        { id: "2", name: "Pool", icon: "waves", hours: "6 AM - 9 PM" },
        { id: "3", name: "Fitness Center", icon: "dumbbell", hours: "24/7" },
        { id: "4", name: "Valet Parking", icon: "car", hours: "Complimentary" },
      ];

  const guestName = activeRoom?.currentGuest?.firstName
    ? `${activeRoom.currentGuest.firstName} ${activeRoom.currentGuest.lastName || ""}`.trim()
    : (activeRoom?.currentGuest?.name || "Rahul");

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
          <span style={{ fontWeight: 600, color: "#818cf8" }}>SmartStay TV 4K Simulator (16:9)</span>
          <span style={{ color: "#94a3b8" }}>• {hotelName} (Room {roomNumber} TV)</span>
        </div>

        {/* Room Selector if multiple rooms exist */}
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
                padding: "0.125rem 0.5rem",
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

        {/* State Toggle Buttons */}
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
            Screen State:
          </span>
          {(
            [
              { id: "GUEST_ACTIVE", label: `Guest: ${guestName}` },
              { id: "DEFAULT_MODE", label: "Hotel Default" },
              { id: "CHECKOUT_DAY", label: "Checkout Day" },
              { id: "SCREENSAVER", label: "Screensaver" },
              { id: "PAIRING", label: "Pairing Mode" },
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

          {/* ═══════════════ STATE 1: GUEST ACTIVE (Personalized Welcome) ═══════════════ */}
          {screenState === "GUEST_ACTIVE" && (
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
              {/* Top Header */}
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
                      padding: "0.5rem 1rem",
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
                    <p style={{ fontSize: "1.875rem", fontWeight: 700, margin: 0 }}>{currentTime || "10:30 AM"}</p>
                    <p style={{ fontSize: "0.75rem", color: "#94a3b8", margin: 0 }}>
                      {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                    </p>
                  </div>
                </div>
              </div>

              {/* Main Information Cards Grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap: "1.5rem",
                  margin: "auto 0",
                }}
              >
                {/* Stay Card */}
                <div
                  style={{
                    borderRadius: "1rem",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    backgroundColor: "rgba(255, 255, 255, 0.05)",
                    padding: "1.25rem",
                    backdropFilter: "blur(12px)",
                  }}
                >
                  <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#a5b4fc", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Your Reservation
                  </span>
                  <div style={{ marginTop: "0.875rem", display: "flex", flexDirection: "column", gap: "0.625rem", fontSize: "0.8125rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#94a3b8" }}>Room</span>
                      <span style={{ fontWeight: 700 }}>Suite {roomNumber}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#94a3b8" }}>Checkout Time</span>
                      <span style={{ fontWeight: 600, color: "#fcd34d" }}>By {checkoutTime}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#94a3b8" }}>Concierge Desk</span>
                      <span style={{ fontWeight: 600, color: "#ffffff" }}>{conciergePhone}</span>
                    </div>
                  </div>
                </div>

                {/* Wi-Fi Card with Real Live QR */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "1rem",
                    borderRadius: "1rem",
                    border: "1px solid rgba(99, 102, 241, 0.3)",
                    backgroundColor: "rgba(49, 46, 129, 0.2)",
                    padding: "1.25rem",
                    backdropFilter: "blur(12px)",
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
                      size={92}
                      level="M"
                    />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <span style={{ fontSize: "0.6875rem", fontWeight: 600, color: "#818cf8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Connect to Wi-Fi
                    </span>
                    <p style={{ fontSize: "0.875rem", fontWeight: 700, margin: "0.125rem 0 0 0", color: "#ffffff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {wifiNetwork}
                    </p>
                    <p style={{ fontSize: "0.6875rem", color: "#94a3b8", margin: "0.25rem 0 0 0", lineHeight: 1.3 }}>
                      Scan QR code on your phone camera for instant connection.
                    </p>
                  </div>
                </div>

                {/* Dynamic Amenities Card */}
                <div
                  style={{
                    borderRadius: "1rem",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    backgroundColor: "rgba(255, 255, 255, 0.05)",
                    padding: "1.25rem",
                    backdropFilter: "blur(12px)",
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
                    <span style={{ fontSize: "0.625rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Guest Services
                    </span>
                  </div>

                  <div
                    style={{
                      marginTop: "0.75rem",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.5rem",
                      fontSize: "0.75rem",
                    }}
                  >
                    {activeAmenities.length > 0 ? (
                      activeAmenities.slice(0, 5).map((amenity: { id: string; name: string; icon: string; hours?: string }) => (
                        <div
                          key={amenity.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "0.5rem",
                            minWidth: 0,
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0, overflow: "hidden" }}>
                            {renderAmenityIcon(amenity.icon)}
                            <span
                              style={{
                                fontSize: "0.8125rem",
                                fontWeight: 600,
                                color: "#f1f5f9",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
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
                                padding: "0.125rem 0.5rem",
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
                      ))
                    ) : (
                      <p style={{ fontSize: "0.75rem", color: "#64748b", fontStyle: "italic", margin: 0 }}>
                        Explore our 24/7 guest hospitality services.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Bottom Entertainment & Rules Bar */}
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

                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <span style={{ color: "#94a3b8" }}>Press Home or Select on TV Remote:</span>
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
                    <span>Open TV & Entertainment (Netflix / YouTube)</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════ STATE 2: DEFAULT MODE (No Guest Checked In) ═══════════════ */}
          {screenState === "DEFAULT_MODE" && (
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
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <p style={{ fontSize: "0.875rem", fontWeight: 700, letterSpacing: "0.15em", color: "#818cf8", textTransform: "uppercase", margin: 0 }}>
                    Welcome to
                  </p>
                  <h1 style={{ fontSize: "2.75rem", fontWeight: 900, color: "#ffffff", margin: "0.25rem 0 0 0" }}>
                    {hotelName}
                  </h1>
                  <p style={{ fontSize: "0.875rem", color: "#94a3b8", margin: "0.5rem 0 0 0", maxWidth: "32rem" }}>
                    {hotelTagline}
                  </p>
                </div>

                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: "1.875rem", fontWeight: 700, margin: 0 }}>{currentTime || "10:30 AM"}</p>
                  <p style={{ fontSize: "0.75rem", color: "#94a3b8", margin: 0 }}>
                    {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  </p>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: "1.5rem",
                  margin: "auto 0",
                  maxWidth: "48rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "1.25rem",
                    borderRadius: "1rem",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    backgroundColor: "rgba(255, 255, 255, 0.05)",
                    padding: "1.5rem",
                    backdropFilter: "blur(12px)",
                  }}
                >
                  <div
                    style={{
                      borderRadius: "0.75rem",
                      backgroundColor: "#ffffff",
                      padding: "0.625rem",
                      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                      flexShrink: 0,
                    }}
                  >
                    <QRCodeSVG
                      value={wifiQrString}
                      size={90}
                    />
                  </div>
                  <div>
                    <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#818cf8", textTransform: "uppercase" }}>
                      Guest Wi-Fi
                    </span>
                    <p style={{ fontSize: "1rem", fontWeight: 700, margin: "0.25rem 0 0 0", color: "#ffffff" }}>
                      {wifiNetwork}
                    </p>
                    <p style={{ fontSize: "0.75rem", color: "#94a3b8", margin: "0.125rem 0 0 0" }}>
                      Scan to connect high-speed internet.
                    </p>
                  </div>
                </div>

                <div
                  style={{
                    borderRadius: "1rem",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    backgroundColor: "rgba(255, 255, 255, 0.05)",
                    padding: "1.5rem",
                    backdropFilter: "blur(12px)",
                  }}
                >
                  <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#818cf8", textTransform: "uppercase" }}>
                    Reception & Concierge
                  </span>
                  <p style={{ fontSize: "1rem", fontWeight: 700, margin: "0.25rem 0 0 0", color: "#ffffff" }}>
                    Available 24 / 7
                  </p>
                  <p style={{ fontSize: "0.75rem", color: "#94a3b8", margin: "0.25rem 0 0 0" }}>
                    Direct line: {conciergePhone}
                  </p>
                </div>
              </div>

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
                <p style={{ margin: 0 }}>SmartStay TV OS • Room {roomNumber}</p>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    borderRadius: "0.75rem",
                    backgroundColor: "rgba(255, 255, 255, 0.1)",
                    padding: "0.375rem 0.875rem",
                    fontWeight: 500,
                    color: "#ffffff",
                  }}
                >
                  <Play style={{ width: "0.875rem", height: "0.875rem" }} />
                  <span>Open TV Applications</span>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════ STATE 3: CHECKOUT DAY ═══════════════ */}
          {screenState === "CHECKOUT_DAY" && (
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
                    DEPARTURE TODAY
                  </span>
                  <h1 style={{ fontSize: "2.75rem", fontWeight: 900, color: "#ffffff", margin: "0.5rem 0 0 0" }}>
                    Checkout Today by {checkoutTime}
                  </h1>
                  <p style={{ fontSize: "0.875rem", color: "#cbd5e1", margin: "0.25rem 0 0 0" }}>
                    Thank you for staying with us at {hotelName}.
                  </p>
                </div>

                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: "1.875rem", fontWeight: 700, margin: 0 }}>{currentTime || "10:30 AM"}</p>
                  <p style={{ fontSize: "0.75rem", color: "#fbbf24", fontWeight: 600, margin: 0 }}>Checkout by {checkoutTime}</p>
                </div>
              </div>

              {/* Numbered Checkout Instructions */}
              <div
                style={{
                  margin: "auto 0",
                  maxWidth: "42rem",
                  borderRadius: "1rem",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  backgroundColor: "rgba(255, 255, 255, 0.05)",
                  padding: "1.5rem",
                  backdropFilter: "blur(12px)",
                }}
              >
                <p style={{ fontSize: "0.75rem", fontWeight: 700, color: "#a5b4fc", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 1rem 0" }}>
                  Departure Steps
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", fontSize: "0.8125rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <span style={{ display: "flex", height: "1.5rem", width: "1.5rem", alignItems: "center", justifyContent: "center", borderRadius: "9999px", backgroundColor: "#4f46e5", fontSize: "0.75rem", fontWeight: 700, flexShrink: 0 }}>
                      1
                    </span>
                    <span>Please check the room and safe for all personal belongings.</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <span style={{ display: "flex", height: "1.5rem", width: "1.5rem", alignItems: "center", justifyContent: "center", borderRadius: "9999px", backgroundColor: "#4f46e5", fontSize: "0.75rem", fontWeight: 700, flexShrink: 0 }}>
                      2
                    </span>
                    <span>Switch off the air conditioner and room lights.</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <span style={{ display: "flex", height: "1.5rem", width: "1.5rem", alignItems: "center", justifyContent: "center", borderRadius: "9999px", backgroundColor: "#4f46e5", fontSize: "0.75rem", fontWeight: 700, flexShrink: 0 }}>
                      3
                    </span>
                    <span>Leave key cards at the reception desk or front desk box.</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <span style={{ display: "flex", height: "1.5rem", width: "1.5rem", alignItems: "center", justifyContent: "center", borderRadius: "9999px", backgroundColor: "#4f46e5", fontSize: "0.75rem", fontWeight: 700, flexShrink: 0 }}>
                      4
                    </span>
                    <span>Front desk staff will assist with luggage and airport transfer.</span>
                  </div>
                </div>
              </div>

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
                <p style={{ margin: 0 }}>Need luggage assistance or late checkout? Call Front Desk ({conciergePhone})</p>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    borderRadius: "0.75rem",
                    backgroundColor: "#ffffff",
                    padding: "0.375rem 0.875rem",
                    fontWeight: 700,
                    color: "#0f172a",
                  }}
                >
                  <Play style={{ width: "0.875rem", height: "0.875rem", fill: "#4f46e5", color: "#4f46e5" }} />
                  <span>Open TV & Entertainment</span>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════ STATE 4: SCREENSAVER ═══════════════ */}
          {screenState === "SCREENSAVER" && (
            <div
              style={{
                position: "relative",
                display: "flex",
                height: "100%",
                alignItems: "center",
                justifyContent: "center",
                padding: "3rem",
                boxSizing: "border-box",
              }}
            >
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: "4.5rem", fontWeight: 900, color: "rgba(255, 255, 255, 0.9)", margin: 0 }}>{currentTime || "10:30 AM"}</p>
                <p style={{ fontSize: "1.25rem", fontWeight: 500, color: "#a5b4fc", margin: "0.5rem 0 0 0" }}>{hotelName}</p>
                <p style={{ fontSize: "0.875rem", color: "#64748b", margin: "0.25rem 0 0 0" }}>Room {roomNumber}</p>
                <p style={{ fontSize: "0.75rem", color: "#475569", margin: "2rem 0 0 0" }}>Press any key on TV remote to wake screen</p>
              </div>
            </div>
          )}

          {/* ═══════════════ STATE 5: PAIRING MODE ═══════════════ */}
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
                Enter this code in your SmartStay hotel dashboard to connect this TV:
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
                Room {roomNumber} • Dynamic secure pairing
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

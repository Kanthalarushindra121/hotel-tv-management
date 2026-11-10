import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { useAuthStore, setAuthCookie, removeAuthCookie } from "./auth-store";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1";

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Helper functions for manual token setting
export function setAuthToken(token: string) {
  if (token) {
    api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    setAuthCookie(token);
    if (typeof window !== "undefined") {
      localStorage.setItem("smartstay_token", token);
    }
  }
}

export function clearAuthToken() {
  delete api.defaults.headers.common["Authorization"];
  removeAuthCookie();
  if (typeof window !== "undefined") {
    localStorage.removeItem("smartstay_token");
  }
}

// Request interceptor: attach token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = useAuthStore.getState().getToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Concurrency lock for token refresh
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: Error | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Response interceptor: handle 401 and refresh
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.url?.includes("/auth/login") &&
      !originalRequest.url?.includes("/auth/refresh") &&
      !originalRequest.url?.includes("/auth/register")
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const newToken = await useAuthStore.getState().refreshAccessToken();
        if (newToken) {
          processQueue(null, newToken);
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
          }
          return api(originalRequest);
        } else {
          processQueue(new Error("Token refresh failed"), null);
          useAuthStore.getState().clearAuth();
          if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
            window.location.href = "/login";
          }
          return Promise.reject(error);
        }
      } catch (refreshErr) {
        processQueue(refreshErr as Error, null);
        useAuthStore.getState().clearAuth();
        if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
          window.location.href = "/login";
        }
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

/* ==========================================================================
   TYPED API CLIENT FUNCTIONS
   ========================================================================== */

// Auth API
export const authApi = {
  login: async (credentials: { email: string; password: string }) => {
    const res = await api.post("/auth/login", credentials);
    return res.data;
  },
  register: async (payload: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    hotelName: string;
    phone?: string;
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
    logoUrl?: string;
  }) => {
    const res = await api.post("/auth/register", payload);
    return res.data;
  },
  refresh: async (refreshToken: string) => {
    const res = await api.post("/auth/refresh", { refreshToken });
    return res.data;
  },
  logout: async (refreshToken?: string) => {
    const res = await api.post("/auth/logout", { refreshToken });
    return res.data;
  },
  getMe: async () => {
    const res = await api.get("/auth/me");
    return res.data;
  },
  forgotPassword: async (email: string) => {
    const res = await api.post("/auth/forgot-password", { email });
    return res.data;
  },
  resetPassword: async (data: { token: string; password: string }) => {
    const res = await api.post("/auth/reset-password", data);
    return res.data;
  },
};

// Dashboard API
export const dashboardApi = {
  getStats: async (params?: { range?: string; startDate?: string; endDate?: string }) => {
    try {
      const res = await api.get("/dashboard/stats", { params });
      return res.data?.data || res.data;
    } catch {
      // Fallback to /hotel/stats if /dashboard/stats is not yet implemented
      const res = await api.get("/hotel/stats", { params });
      return res.data?.data || res.data;
    }
  },
  getActivity: async (limit: number = 10) => {
    try {
      const res = await api.get("/dashboard/activity", { params: { limit } });
      return res.data?.data || res.data;
    } catch {
      // Fallback to /today
      const res = await api.get("/today");
      return res.data?.data || res.data;
    }
  },
};

// Rooms API
export interface RoomDTO {
  id: string;
  hotelId?: string;
  number: string;
  roomNumber?: string;
  floor: number;
  type: string;
  status: "AVAILABLE" | "OCCUPIED" | "CLEANING" | "MAINTENANCE" | string;
  capacity?: number;
  notes?: string;
  currentBookingId?: string;
  currentGuest?: {
    id?: string;
    firstName?: string;
    lastName?: string;
    name?: string;
    phone?: string;
    email?: string;
    checkIn?: string;
    checkOut?: string;
  };
  device?: {
    id: string;
    deviceId?: string;
    name?: string;
    isOnline?: boolean;
    status: "ONLINE" | "OFFLINE" | "UNPAIRED" | "PAIRED" | string;
    screenState?: string;
    lastSeen?: string;
    lastSeenAt?: string;
    pairingCode?: string;
  };
  assignedTvId?: string | null;
  deviceId?: string | null;
  isOnline?: boolean;
  lastSeenAt?: string | null;
  wifiZoneId?: string | null;
  wifiZone?: {
    id: string;
    name: string;
    ssid: string;
  };
  history?: Array<{
    id: string;
    guestName: string;
    checkIn: string;
    checkOut: string;
    nights: number;
  }>;
}

const formatRoom = (raw: any): RoomDTO => {
  if (!raw) return raw;
  const num = String(raw.number || raw.roomNumber || "").trim();
  const history = raw.history || (raw.bookings || []).map((b: any) => ({
    id: b.id,
    guestName: b.guest ? `${b.guest.firstName || ""} ${b.guest.lastName || ""}`.trim() : (b.guestName || "Guest"),
    checkIn: b.checkIn || (b.checkInDate ? new Date(b.checkInDate).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "—"),
    checkOut: b.checkOut || (b.checkOutDate ? new Date(b.checkOutDate).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "—"),
    nights: b.nights || 1,
    status: b.status || "Completed",
  }));
  return {
    ...raw,
    number: num,
    roomNumber: num,
    type: raw.type || raw.roomType?.name || "Standard Room",
    capacity: raw.capacity ?? raw.maxOccupancy ?? 2,
    history,
  };
};

export const roomsApi = {
  getAll: async (params?: Record<string, unknown>): Promise<RoomDTO[]> => {
    const res = await api.get("/rooms", { params });
    const payload = res.data;
    let list: any[] = [];
    if (Array.isArray(payload)) list = payload;
    else if (Array.isArray(payload?.data)) list = payload.data;
    else if (Array.isArray(payload?.rooms)) list = payload.rooms;
    return list.map(formatRoom);
  },
  getById: async (id: string): Promise<RoomDTO> => {
    const res = await api.get(`/rooms/${id}`);
    const data = res.data?.data || res.data;
    return formatRoom(data);
  },
  create: async (data: Partial<RoomDTO>): Promise<RoomDTO> => {
    const res = await api.post("/rooms", data);
    return formatRoom(res.data?.data || res.data);
  },
  update: async (id: string, data: Partial<RoomDTO>): Promise<RoomDTO> => {
    const res = await api.put(`/rooms/${id}`, data);
    return formatRoom(res.data?.data || res.data);
  },
  delete: async (id: string) => {
    const res = await api.delete(`/rooms/${id}`);
    return res.data;
  },
  assignTv: async (roomId: string, tvDeviceId: string) => {
    const res = await api.post(`/rooms/${roomId}/assign-tv`, { tvDeviceId });
    return res.data?.data || res.data;
  },
  unassignTv: async (roomId: string) => {
    const res = await api.post(`/rooms/${roomId}/unassign-tv`);
    return res.data?.data || res.data;
  },
  getAvailableRooms: async (): Promise<RoomDTO[]> => {
    const res = await api.get("/rooms/available");
    const payload = res.data;
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
  },
};

// Check-ins & Check-outs API
export interface CheckInPayload {
  guestName: string;
  phone?: string;
  email?: string;
  roomId: string;
  roomNumber?: string;
  checkoutPolicy?: "FIXED_11AM" | "HOURLY" | "HOURLY_3H" | "HOURLY_6H" | "HOURLY_9H" | "HOURLY_12H" | "CUSTOM" | string;
  nights?: number;
  hours?: number;
  checkOut?: string;
  specialRequests?: string;
  forceCheckIn?: boolean;
}

export const checkinsApi = {
  checkIn: async (payload: CheckInPayload) => {
    try {
      const res = await api.post("/checkins/check-in", payload);
      return res.data;
    } catch (err: any) {
      if (err.response?.status === 404) {
        const res = await api.post("/checkins", payload);
        return res.data;
      }
      throw err;
    }
  },
  checkOut: async (bookingOrRoomId: string, notes?: string) => {
    try {
      const res = await api.post(`/checkins/check-out/${bookingOrRoomId}`, { notes });
      return res.data;
    } catch (err: any) {
      if (err.response?.status === 404) {
        const res = await api.post("/checkouts", { bookingId: bookingOrRoomId, roomId: bookingOrRoomId, notes });
        return res.data;
      }
      throw err;
    }
  },
  getToday: async () => {
    const res = await api.get("/today");
    return res.data?.data || res.data;
  },
};

// Wi-Fi Management API
export interface WifiZoneDTO {
  id: string;
  name: string;
  ssid: string;
  password?: string;
  security: "WPA2" | "WPA3" | "WPA" | "nopass" | string;
  securityType?: string;
  floorCoverage?: string;
  isActive: boolean;
  assignedRoomsCount?: number;
  assignedRoomNumbers?: string[];
  createdAt?: string;
}

export const wifiApi = {
  getAll: async (): Promise<WifiZoneDTO[]> => {
    try {
      const res = await api.get("/wifi");
      const payload = res.data;
      if (Array.isArray(payload)) return payload;
      if (Array.isArray(payload?.data)) return payload.data;
      return [];
    } catch {
      // Return empty array if not yet on backend
      return [];
    }
  },
  createZone: async (zone: Partial<WifiZoneDTO> & { password?: string }): Promise<WifiZoneDTO> => {
    const res = await api.post("/wifi", zone);
    return res.data?.data || res.data;
  },
  updateZone: async (id: string, zone: Partial<WifiZoneDTO> & { password?: string }): Promise<WifiZoneDTO> => {
    const res = await api.put(`/wifi/${id}`, zone);
    return res.data?.data || res.data;
  },
  deleteZone: async (id: string) => {
    const res = await api.delete(`/wifi/${id}`);
    return res.data;
  },
  updateCredentials: async (data: { ssid: string; password?: string; security?: string }) => {
    const res = await api.put("/hotel/wifi", data);
    return res.data?.data || res.data;
  },
};

// Staff Management API
export interface StaffDTO {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: "OWNER" | "ADMIN" | "RECEPTIONIST" | "STAFF";
  isActive: boolean;
  lastLoginAt?: string | null;
  createdAt?: string;
}

export const staffApi = {
  getAll: async (): Promise<StaffDTO[]> => {
    try {
      const res = await api.get("/staff");
      const payload = res.data;
      if (Array.isArray(payload)) return payload;
      if (Array.isArray(payload?.data)) return payload.data;
      return [];
    } catch {
      return [];
    }
  },
  create: async (data: {
    firstName: string;
    lastName: string;
    email: string;
    username?: string;
    phone?: string;
    role: string;
    password?: string;
    temporaryPassword?: string;
  }): Promise<StaffDTO> => {
    const res = await api.post("/staff", {
      ...data,
      password: data.password || data.temporaryPassword,
    });
    return res.data?.data || res.data;
  },
  update: async (id: string, data: Partial<StaffDTO>): Promise<StaffDTO> => {
    const res = await api.put(`/staff/${id}`, data);
    return res.data?.data || res.data;
  },
  delete: async (id: string) => {
    const res = await api.delete(`/staff/${id}`);
    return res.data;
  },
};

// Guests API
export interface GuestDTO {
  id: string;
  hotelId: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  nationality?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  bookings?: Array<{
    id: string;
    roomId: string;
    status: string;
    checkInDate: string;
    checkOutDate: string;
    nights: number;
    guestCount?: number;
    specialRequests?: string | null;
    actualCheckoutAt?: string | null;
    room?: {
      id: string;
      roomNumber: string;
      floor?: number;
      roomType?: { name: string } | null;
    };
  }>;
}

export const guestsApi = {
  getAll: async (params?: { search?: string; page?: number; limit?: number }): Promise<GuestDTO[]> => {
    try {
      const res = await api.get("/guests", { params });
      const payload = res.data;
      if (Array.isArray(payload?.guests)) return payload.guests;
      if (Array.isArray(payload?.data)) return payload.data;
      if (Array.isArray(payload)) return payload;
      return [];
    } catch {
      return [];
    }
  },
  getById: async (id: string): Promise<GuestDTO> => {
    const res = await api.get(`/guests/${id}`);
    return res.data?.data || res.data;
  },
  delete: async (id: string) => {
    const res = await api.delete(`/guests/${id}`);
    return res.data;
  },
};

// Hotel & Settings API
export interface HotelSettingsDTO {
  id?: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  phone?: string;
  email?: string;
  website?: string;
  tagline?: string;
  checkInTime?: string;
  checkOutTime?: string;
  timezone?: string;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  welcomeMessage?: string;
  checkoutMessage?: string;
  screensaverDelaySeconds?: number;
  wifiNetwork?: string;
  wifiPassword?: string;
  wifiSecurity?: string;
  amenities?: Array<{ id: string; name: string; icon: string; hours?: string; isActive: boolean }>;
  houseRules?: Array<{ id: string; text: string; order: number }>;
  checkoutSteps?: Array<{ id: string; text: string; order: number }>;
}

export const hotelApi = {
  getProfile: async () => {
    try {
      const res = await api.get("/hotel/profile");
      return res.data?.data || res.data;
    } catch {
      const res = await api.get("/hotel");
      return res.data?.data || res.data;
    }
  },
  updateProfile: async (data: Partial<HotelSettingsDTO>) => {
    try {
      const res = await api.put("/hotel/profile", data);
      return res.data?.data || res.data;
    } catch {
      const res = await api.put("/hotel", data);
      return res.data?.data || res.data;
    }
  },
  getSettings: async () => {
    const res = await api.get("/hotel/settings");
    return res.data?.data || res.data;
  },
  updateSettings: async (settings: Record<string, unknown>) => {
    const res = await api.put("/hotel/settings", settings);
    return res.data?.data || res.data;
  },
  getWifi: async () => {
    try {
      const res = await api.get("/hotel/wifi");
      return res.data?.data || res.data;
    } catch {
      return null;
    }
  },
  updateWifi: async (wifiData: { networkName: string; password?: string; securityType?: string }) => {
    const res = await api.put("/hotel/wifi", wifiData);
    return res.data?.data || res.data;
  },
  updateAmenities: async (amenities: unknown[]) => {
    const res = await api.put("/hotel/amenities", { amenities });
    return res.data?.data || res.data;
  },
  updateHouseRules: async (houseRules: unknown[]) => {
    const res = await api.put("/hotel/house-rules", { houseRules });
    return res.data?.data || res.data;
  },
  updateCheckoutSteps: async (checkoutSteps: unknown[]) => {
    const res = await api.put("/hotel/checkout-steps", { checkoutSteps });
    return res.data?.data || res.data;
  },
};

// Devices API
export const devicesApi = {
  getAll: async () => {
    const res = await api.get("/devices");
    return res.data?.data || res.data;
  },
  getById: async (id: string) => {
    const res = await api.get(`/devices/${id}`);
    return res.data?.data || res.data;
  },
  validatePairingCode: async (code: string) => {
    const res = await api.post("/devices/pairing/validate", { code });
    return res.data?.data || res.data;
  },
  confirmPairing: async (code: string, roomId: string) => {
    const res = await api.post("/devices/pairing/confirm", { code, roomId });
    return res.data?.data || res.data;
  },
  unpair: async (deviceId: string) => {
    const res = await api.post(`/devices/${deviceId}/unpair`);
    return res.data?.data || res.data;
  },
  refresh: async (deviceId: string) => {
    const res = await api.post(`/devices/${deviceId}/refresh`);
    return res.data?.data || res.data;
  },
  move: async (deviceId: string, roomId: string) => {
    const res = await api.put(`/devices/${deviceId}/move`, { roomId });
    return res.data?.data || res.data;
  },
  pair: async (code: string, roomId?: string) => {
    if (roomId) {
      return devicesApi.confirmPairing(code, roomId);
    }
    return devicesApi.validatePairingCode(code);
  },
  sendCommand: async (deviceId: string, command: string, payload?: any) => {
    const res = await api.post(`/devices/${deviceId}/command`, { command, payload });
    return res.data;
  },
  assign: async (deviceId: string, roomId: string, replaceExisting: boolean = true) => {
    const res = await api.post(`/devices/${deviceId}/assign`, { roomId, replaceExisting });
    return res.data?.data || res.data;
  },
  unassign: async (deviceId: string) => {
    const res = await api.post(`/devices/${deviceId}/unassign`);
    return res.data;
  },
  delete: async (deviceId: string) => {
    const res = await api.delete(`/devices/${deviceId}`);
    return res.data;
  },
  getAvailableDevices: async () => {
    const res = await api.get('/devices/available');
    const payload = res.data;
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
  },
  getAvailableRooms: async (): Promise<RoomDTO[]> => {
    const res = await api.get('/rooms/available');
    const payload = res.data;
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
  },
  getDiagnostics: async () => {
    const res = await api.get('/devices/diagnostics/system');
    return res.data?.data || res.data;
  },
};

// Screensaver API
export const screensaverApi = {
  get: async () => {
    const res = await api.get('/hotel/screensaver');
    return res.data?.data || res.data;
  },
  update: async (data: any) => {
    const res = await api.put('/hotel/screensaver', data);
    return res.data?.data || res.data;
  },
};

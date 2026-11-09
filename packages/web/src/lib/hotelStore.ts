import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface AmenityItem {
  id: string;
  name: string;
  icon: string; // 'utensils' | 'waves' | 'dumbbell' | 'car' | 'sparkles' | 'coffee' | 'bell' | 'wifi' | 'tv' | 'shield'
  hours?: string;
  isActive: boolean;
}

export interface HotelSettingsState {
  hotelName: string;
  tagline: string;
  wifiNetwork: string;
  wifiPassword: string;
  wifiSecurity: "WPA2" | "WPA3" | "WPA" | "nopass";
  checkoutTime: string;
  quietHoursStart: string;
  quietHoursEnd: string;
  conciergePhone: string;
  amenities: AmenityItem[];

  updateSettings: (settings: Partial<Omit<HotelSettingsState, "updateSettings" | "getWifiQrString" | "toggleAmenity" | "addAmenity" | "removeAmenity">>) => void;
  getWifiQrString: () => string;
  toggleAmenity: (id: string) => void;
  addAmenity: (name: string, hours?: string, icon?: string) => void;
  removeAmenity: (id: string) => void;
}

export function buildWifiQrString(
  ssid: string,
  password: string,
  security: "WPA2" | "WPA3" | "WPA" | "nopass" = "WPA2"
): string {
  if (security === "nopass" || !password) {
    return `WIFI:S:${ssid};;`;
  }
  return `WIFI:S:${ssid};T:${security};P:${password};;`;
}

export const DEFAULT_AMENITIES: AmenityItem[] = [
  { id: "dining", name: "Royal Dining", icon: "utensils", hours: "7 AM - 11 PM", isActive: true },
  { id: "pool", name: "Infinity Pool", icon: "waves", hours: "6 AM - 9 PM", isActive: true },
  { id: "gym", name: "Fitness Center", icon: "dumbbell", hours: "24/7", isActive: true },
  { id: "valet", name: "Valet Parking", icon: "car", hours: "Complimentary", isActive: true },
  { id: "spa", name: "Ayurvedic Spa", icon: "sparkles", hours: "9 AM - 8 PM", isActive: true },
  { id: "breakfast", name: "Complimentary Breakfast", icon: "coffee", hours: "7 AM - 10:30 AM", isActive: true },
  { id: "roomservice", name: "24/7 Room Service", icon: "bell", hours: "Dial 9", isActive: true },
];

export const useHotelStore = create<HotelSettingsState>()(
  persist(
    (set, get) => ({
      hotelName: "",
      tagline: "",
      wifiNetwork: "",
      wifiPassword: "",
      wifiSecurity: "WPA2",
      checkoutTime: "11:00 AM",
      quietHoursStart: "10:00 PM",
      quietHoursEnd: "7:00 AM",
      conciergePhone: "",
      amenities: DEFAULT_AMENITIES,

      updateSettings: (newSettings) =>
        set((state) => ({
          ...state,
          ...newSettings,
        })),

      getWifiQrString: () => {
        const { wifiNetwork, wifiPassword, wifiSecurity } = get();
        return buildWifiQrString(wifiNetwork, wifiPassword, wifiSecurity);
      },

      toggleAmenity: (id) =>
        set((state) => ({
          amenities: state.amenities.map((a) =>
            a.id === id ? { ...a, isActive: !a.isActive } : a
          ),
        })),

      addAmenity: (name, hours, icon = "sparkles") =>
        set((state) => ({
          amenities: [
            ...state.amenities,
            {
              id: `amenity-${Date.now()}`,
              name,
              hours,
              icon,
              isActive: true,
            },
          ],
        })),

      removeAmenity: (id) =>
        set((state) => ({
          amenities: state.amenities.filter((a) => a.id !== id),
        })),
    }),
    {
      name: "smartstay-hotel-settings",
    }
  )
);

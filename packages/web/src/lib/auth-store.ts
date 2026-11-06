import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "OWNER" | "ADMIN" | "RECEPTIONIST" | "STAFF" | string;
  hotelId?: string;
  avatar?: string;
}

export interface AuthHotel {
  id: string;
  name: string;
  slug?: string;
  logoUrl?: string;
  tagline?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
}

export function setAuthCookie(token: string) {
  if (typeof document !== "undefined") {
    const maxAge = 7 * 24 * 60 * 60; // 7 days
    document.cookie = `smartstay_token=${encodeURIComponent(token)}; path=/; max-age=${maxAge}; SameSite=Lax`;
  }
}

export function removeAuthCookie() {
  if (typeof document !== "undefined") {
    document.cookie = "smartstay_token=; path=/; max-age=0; SameSite=Lax";
  }
}

export interface AuthState {
  user: AuthUser | null;
  hotel: AuthHotel | null;
  tokens: AuthTokens | null;
  isLoading: boolean;
  setAuth: (user: AuthUser, hotel: AuthHotel | null, tokens: AuthTokens) => void;
  setUser: (user: AuthUser | null) => void;
  setHotel: (hotel: AuthHotel | null) => void;
  clearAuth: () => void;
  refreshAccessToken: () => Promise<string | null>;
  isAuthenticated: () => boolean;
  getToken: () => string | null;
  getHotelId: () => string | null;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      hotel: null,
      tokens: null,
      isLoading: false,

      setAuth: (user, hotel, tokens) => {
        if (tokens?.accessToken) {
          setAuthCookie(tokens.accessToken);
          if (typeof window !== "undefined") {
            localStorage.setItem("smartstay_token", tokens.accessToken);
          }
        }
        set({ user, hotel, tokens, isLoading: false });
      },

      setUser: (user) => set({ user }),

      setHotel: (hotel) => set({ hotel }),

      clearAuth: () => {
        removeAuthCookie();
        if (typeof window !== "undefined") {
          localStorage.removeItem("smartstay_token");
        }
        set({ user: null, hotel: null, tokens: null, isLoading: false });
      },

      refreshAccessToken: async () => {
        const state = get();
        const refreshToken = state.tokens?.refreshToken;
        if (!refreshToken) {
          get().clearAuth();
          return null;
        }

        try {
          const res = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1"}/auth/refresh`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ refreshToken }),
            }
          );

          if (!res.ok) {
            get().clearAuth();
            return null;
          }

          const json = await res.json();
          const newTokens: AuthTokens = json.data || json;
          if (newTokens?.accessToken) {
            setAuthCookie(newTokens.accessToken);
            if (typeof window !== "undefined") {
              localStorage.setItem("smartstay_token", newTokens.accessToken);
            }
            set((prev) => ({
              ...prev,
              tokens: {
                ...prev.tokens,
                ...newTokens,
                refreshToken: newTokens.refreshToken || prev.tokens?.refreshToken,
              },
            }));
            return newTokens.accessToken;
          }
          get().clearAuth();
          return null;
        } catch {
          get().clearAuth();
          return null;
        }
      },

      isAuthenticated: () => {
        const { tokens, user } = get();
        return !!tokens?.accessToken && !!user;
      },

      getToken: () => {
        const { tokens } = get();
        if (tokens?.accessToken) return tokens.accessToken;
        if (typeof window !== "undefined") {
          return localStorage.getItem("smartstay_token");
        }
        return null;
      },

      getHotelId: () => {
        const { user, hotel } = get();
        return hotel?.id || user?.hotelId || null;
      },
    }),
    {
      name: "smartstay_auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        hotel: state.hotel,
        tokens: state.tokens,
      }),
    }
  )
);

export function getToken(): string | null {
  return useAuthStore.getState().getToken();
}

export function getHotelId(): string | null {
  return useAuthStore.getState().getHotelId();
}

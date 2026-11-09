"use client";

import { create } from "zustand";

interface NavigationState {
  isNavigating: boolean;
  targetPath: string | null;
  targetLabel: string | null;
  startNavigation: (path: string, label?: string) => void;
  finishNavigation: () => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  isNavigating: false,
  targetPath: null,
  targetLabel: null,
  startNavigation: (path, label) =>
    set({
      isNavigating: true,
      targetPath: path,
      targetLabel: label || null,
    }),
  finishNavigation: () =>
    set({
      isNavigating: false,
      targetPath: null,
      targetLabel: null,
    }),
}));


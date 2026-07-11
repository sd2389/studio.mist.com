import { create } from "zustand";

type ViewerToastState = {
  message: string | null;
  showToast: (message: string, durationMs?: number) => void;
  clearToast: () => void;
};

let clearTimer: ReturnType<typeof setTimeout> | null = null;

export const useViewerToastStore = create<ViewerToastState>((set) => ({
  message: null,
  showToast: (message, durationMs = 2800) => {
    if (clearTimer) clearTimeout(clearTimer);
    set({ message });
    clearTimer = setTimeout(() => {
      set({ message: null });
      clearTimer = null;
    }, durationMs);
  },
  clearToast: () => {
    if (clearTimer) clearTimeout(clearTimer);
    clearTimer = null;
    set({ message: null });
  },
}));

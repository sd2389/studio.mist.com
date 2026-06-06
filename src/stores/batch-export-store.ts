import { create } from "zustand";

type BatchExportState = {
  modelReady: boolean;
  setModelReady: (ready: boolean) => void;
  bumpModelReady: () => void;
};

export const useBatchExportStore = create<BatchExportState>((set) => ({
  modelReady: false,
  setModelReady: (modelReady) => set({ modelReady }),
  bumpModelReady: () => set({ modelReady: true }),
}));

export function signalModelReady(): void {
  useBatchExportStore.getState().bumpModelReady();
}

export function resetModelReady(): void {
  useBatchExportStore.getState().setModelReady(false);
}

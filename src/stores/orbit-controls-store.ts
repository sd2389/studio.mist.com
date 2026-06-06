import * as THREE from "three";
import { create } from "zustand";

type OrbitControlsLike = {
  object: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  target: THREE.Vector3;
  minDistance: number;
  maxDistance: number;
  update: () => void;
};

type State = {
  controls: OrbitControlsLike | null;
  setControls: (c: OrbitControlsLike | null) => void;
};

export const useOrbitControlsStore = create<State>((set) => ({
  controls: null,
  setControls: (controls) => set({ controls }),
}));

const DEFAULT_DISTANCE = 2.2;
const MIN_FACTOR = 0.2;
const MAX_FACTOR = 5.0;

/** Multiply current camera→target distance by `factor`. <1 zooms in, >1 zooms out. */
export function zoomBy(factor: number): void {
  const c = useOrbitControlsStore.getState().controls;
  if (!c) return;
  const dir = new THREE.Vector3().subVectors(c.object.position, c.target);
  const dist = dir.length();
  const next = THREE.MathUtils.clamp(dist * factor, c.minDistance, c.maxDistance);
  dir.normalize().multiplyScalar(next);
  c.object.position.copy(c.target).add(dir);
  c.update();
}

/** Set camera distance to `DEFAULT_DISTANCE * factor`. 1 = fit, 0.5 = closer, 2 = further. */
export function zoomToFactor(factor: number): void {
  const c = useOrbitControlsStore.getState().controls;
  if (!c) return;
  const target = THREE.MathUtils.clamp(
    DEFAULT_DISTANCE * factor,
    c.minDistance,
    c.maxDistance,
  );
  const dir = new THREE.Vector3()
    .subVectors(c.object.position, c.target)
    .normalize()
    .multiplyScalar(target);
  c.object.position.copy(c.target).add(dir);
  c.update();
}

export const ZOOM_PRESETS: { id: string; label: string; factor: number }[] = [
  { id: "200", label: "200%", factor: MIN_FACTOR + 0.3 },
  { id: "150", label: "150%", factor: 0.66 },
  { id: "100", label: "100% (fit)", factor: 1 },
  { id: "75", label: "75%", factor: 1.33 },
  { id: "50", label: "50%", factor: 2 },
  { id: "25", label: "25%", factor: MAX_FACTOR * 0.6 },
];

export type CameraPose = {
  cameraPosition: [number, number, number];
  target: [number, number, number];
};

export function captureCurrentCameraPose(): CameraPose | null {
  const c = useOrbitControlsStore.getState().controls;
  if (!c) return null;
  return {
    cameraPosition: [c.object.position.x, c.object.position.y, c.object.position.z],
    target: [c.target.x, c.target.y, c.target.z],
  };
}

export function applyCameraPose(pose: CameraPose): void {
  const c = useOrbitControlsStore.getState().controls;
  if (!c) return;
  c.object.position.set(...pose.cameraPosition);
  c.target.set(...pose.target);
  c.update();
}

export function resetCameraToDefault(): void {
  applyCameraPose({
    cameraPosition: [0, 0.35, 2.2],
    target: [0, 0, 0],
  });
}

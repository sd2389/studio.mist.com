/**
 * Turntable orbit math. Azimuth is measured from +Z toward +X so it matches the studio's
 * saved poses (front = +Z, right = +X).
 */

export type Vec3 = [number, number, number];

export type OrbitStart = {
  /** Pivot the camera circles (the OrbitControls target). */
  target: Vec3;
  azimuth: number;
  /** Camera height above the pivot; constant for the whole orbit. */
  height: number;
  /** Horizontal distance to the pivot axis — not the 3D distance, which would zoom out. */
  radius: number;
};

const MIN_RADIUS_FRACTION = 1e-3;

export function orbitStartFromView(position: Vec3, target: Vec3): OrbitStart {
  const dx = position[0] - target[0];
  const dy = position[1] - target[1];
  const dz = position[2] - target[2];
  const horizontal = Math.hypot(dx, dz);
  // Straight-down views have no azimuth; keep a sliver of radius so lookAt stays defined.
  const minRadius = Math.max(Math.abs(dy) * MIN_RADIUS_FRACTION, 1e-6);
  return {
    target: [...target],
    azimuth: horizontal > minRadius ? Math.atan2(dx, dz) : 0,
    height: dy,
    radius: Math.max(horizontal, minRadius),
  };
}

export function orbitPosition(start: OrbitStart, angleOffset: number): Vec3 {
  const azimuth = start.azimuth + angleOffset;
  return [
    start.target[0] + Math.sin(azimuth) * start.radius,
    start.target[1] + start.height,
    start.target[2] + Math.cos(azimuth) * start.radius,
  ];
}

/** Angle for frame `index` of a seamless loop: frame N would repeat frame 0. */
export function turntableAngle(index: number, frameCount: number): number {
  return (index / Math.max(1, frameCount)) * Math.PI * 2;
}

export function orbitStartFromAngles(
  target: Vec3,
  azimuthDeg: number,
  elevationDeg: number,
  distance: number,
): OrbitStart {
  const elevation = (elevationDeg * Math.PI) / 180;
  return {
    target: [...target],
    azimuth: (azimuthDeg * Math.PI) / 180,
    height: Math.sin(elevation) * distance,
    radius: Math.max(Math.cos(elevation) * distance, distance * MIN_RADIUS_FRACTION),
  };
}

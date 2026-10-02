import * as THREE from "three";

/**
 * Gem configs describe body colour the way three's raster transmission wants it: a colour
 * reached after an attenuation distance (tuned for that path). The ray-traced stone needs
 * Beer–Lambert absorption per stone radius instead; this is the one conversion between them.
 */
export const ABSORPTION_PER_RADIUS = 0.35;

export type Absorption = [number, number, number];

/** Linear-RGB absorption per stone radius for an attenuation colour (sRGB hex) and distance. */
export function absorptionFromAttenuation(attenuationColor: string, attenuationDistance: number): Absorption {
  const attenuation = new THREE.Color(attenuationColor);
  const distance = Math.max(attenuationDistance, 1e-3);
  const absorb = (c: number) => Math.max(0, (-Math.log(Math.min(Math.max(c, 1e-3), 1)) / distance) * ABSORPTION_PER_RADIUS);
  return [absorb(attenuation.r), absorb(attenuation.g), absorb(attenuation.b)];
}

/** Linear-RGB transmittance as an sRGB hex colour. */
export function linearHex(r: number, g: number, b: number): string {
  return `#${new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace).getHexString()}`;
}

/** Inverse of `absorptionFromAttenuation`: the attenuation colour giving `absorption` at `attenuationDistance`. */
export function attenuationForAbsorption(absorption: Readonly<Absorption>, attenuationDistance: number): string {
  const [r, g, b] = absorption.map((a) => Math.exp((-a * attenuationDistance) / ABSORPTION_PER_RADIUS));
  return linearHex(r!, g!, b!);
}

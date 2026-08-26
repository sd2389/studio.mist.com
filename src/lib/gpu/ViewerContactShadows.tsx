"use client";

type ViewerContactShadowsProps = {
  position?: [number, number, number];
  color?: string;
  opacity?: number;
  scale?: number;
  blur?: number;
  far?: number;
};

/**
 * Ground contact shadow that works on WebGPURenderer.
 * drei's ContactShadows uses GLSL ShaderMaterial + WebGLRenderTarget, which
 * the WebGPU backend cannot compile.
 */
export function ViewerContactShadows({
  position = [0, -0.55, 0],
  color = "#0a0a0a",
  opacity = 0.4,
  scale = 12,
}: ViewerContactShadowsProps) {
  if (opacity <= 0) return null;
  return (
    <mesh rotation-x={-Math.PI / 2} position={position} receiveShadow>
      <planeGeometry args={[scale, scale]} />
      <shadowMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}

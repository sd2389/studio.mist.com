import * as THREE from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CAMPAIGN_PACK_CONFIG } from "../domain/defaults";
import { planCampaignPack } from "../domain/plan";
import type { CampaignPackConfig } from "../domain/types";
import { PackZipWriter } from "../domain/zip-writer";
import type { PackBackendInput, PackRenderBackend } from "./pack-backend";

/*
 * The pack on the stage: the metal environment is probed from the live stage's frames before
 * anything renders. Re-skinned metals are lit with what the probe finds, so the harness, whose
 * stage draws only when told, keeps it ticking meanwhile and stops a pack the probe found nothing for.
 */

const calls = vi.hoisted(() => [] as string[]);
const probe = vi.hoisted(() => ({ environment: null as unknown }));

vi.mock("./environment-probe", () => ({
  probeMetalEnvironment: async () => {
    calls.push("probe");
    return probe.environment;
  },
}));
vi.mock("./pack-backend", () => ({
  createPackRenderBackend: async (input: PackBackendInput): Promise<PackRenderBackend> => {
    calls.push(`backend with ${input.environment ? "the environment" : "no environment"}`);
    return {
      notices: [],
      setMetal: async () => {},
      renderStill: async () => ({ jpg: new Blob(["jpg"]), png: null }),
      renderSpinFrame: async () => new Blob(["frame"]),
      renderTurntable: async () => new Blob(["mp4"]),
      renderScope: async () => new Blob(["aset"]),
      dispose: () => calls.push("disposed"),
    };
  },
}));

const { renderPackOnStage } = await import("./stage-pack");

const IDENTITY = { modelId: "ring.glb", sku: "RING-1", name: "Ring" };
const ENVIRONMENT = { texture: null, rotation: new THREE.Euler(), intensityScale: 1 };

function pack(metals: CampaignPackConfig["metals"], options: { tick?: boolean; requireEnvironment?: boolean } = {}) {
  const config: CampaignPackConfig = { ...DEFAULT_CAMPAIGN_PACK_CONFIG, metals, angleIds: ["front"], turntable: { ...DEFAULT_CAMPAIGN_PACK_CONFIG.turntable, enabled: false }, spin: { ...DEFAULT_CAMPAIGN_PACK_CONFIG.spin, enabled: false } };
  const plan = planCampaignPack(config, { identity: IDENTITY, savedPoses: [] });
  const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 200);
  return renderPackOnStage(
    { gl: {} as never, scene: new THREE.Scene(), camera },
    {
      plan,
      config,
      identity: IDENTITY,
      camera,
      orbitTarget: [0, 0, 0],
      limits: { maxEdge: 2000, watermark: false },
      writer: new PackZipWriter(),
      openVideo: async () => {
        throw new Error("no turntables in this pack");
      },
      origin: "https://studio.mist.com",
      generatedAt: new Date("2026-10-06T09:00:00Z"),
      signal: new AbortController().signal,
      onProgress: () => {},
      keepStageTicking: options.tick
        ? () => {
            calls.push("ticking");
            return () => calls.push("stopped ticking");
          }
        : undefined,
      requireEnvironment: options.requireEnvironment,
    },
  );
}

beforeEach(() => {
  calls.length = 0;
  probe.environment = ENVIRONMENT;
});

describe("renderPackOnStage", () => {
  it("keeps the stage ticking while the probe waits on its frames, and only then renders", async () => {
    await pack(["gold-18k-yellow"], { tick: true, requireEnvironment: true });
    expect(calls).toEqual(["ticking", "probe", "stopped ticking", "backend with the environment", "disposed"]);
  });

  it("stops a pack that re-skins metals when the probe found no environment to light them with", async () => {
    probe.environment = null;
    await expect(pack(["gold-18k-yellow", "current"], { tick: true, requireEnvironment: true })).rejects.toThrow(/without reflections/);
    expect(calls).toEqual(["ticking", "probe", "stopped ticking"]);
  });

  it("renders a pack of the metals as configured, which need none, and the studio's own as it always has", async () => {
    probe.environment = null;
    await pack(["current"], { requireEnvironment: true });
    await pack(["gold-18k-yellow"]);
    expect(calls).toEqual(["probe", "backend with no environment", "disposed", "probe", "backend with no environment", "disposed"]);
  });
});

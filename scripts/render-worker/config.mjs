import os from "node:os";
import path from "node:path";
import { PROFILES } from "./browser.mjs";
import { CONVERT_KIND } from "./convert.mjs";
import { assetPrefix, DEFAULT_ASSET_PREFIXES } from "./network.mjs";

/**
 * What the harness's export mode renders and this worker can hand in: turntables through ffmpeg,
 * spins as a ZIP, and Campaign Packs as one ZIP with their turntables through ffmpeg.
 */
export const RENDERABLE_KINDS = ["still", "angle_set", "turntable", "spin", "campaign_pack"];
/** The kinds whose videos this worker's ffmpeg encodes. */
export const VIDEO_KINDS = ["turntable", "campaign_pack"];
/** WORKER_ID in backend/app/schemas/render_job.py, less the slot suffix this adds. */
const WORKER_ID = /^[A-Za-z0-9._:-]{1,60}$/;
/** Hosts a plain-HTTP page is a secure context on, as WebGPU and WebCodecs need. */
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

function integer(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a whole number of at least 1`);
  return value;
}

const list = (value) => (value ?? "").split(",").map((item) => item.trim()).filter(Boolean);

function required(env, name) {
  if (!env[name]) throw new Error(`${name} is not set`);
  return env[name];
}

/**
 * The token a worker sends: the first of RENDER_WORKER_TOKEN's comma-separated tokens. The API
 * accepts any token on its list, so a rotation adds the new one there first.
 */
function workerTokenFrom(env) {
  const token = required(env, "RENDER_WORKER_TOKEN")
    .split(",")
    .map((part) => part.trim())
    .find(Boolean);
  if (!token) throw new Error("RENDER_WORKER_TOKEN has no token");
  return token;
}

function profileFrom(env, platform) {
  const name = env.WORKER_GPU || (platform === "darwin" ? "metal" : "nvidia");
  if (!PROFILES[name]) throw new Error(`WORKER_GPU must be one of ${Object.keys(PROFILES).join(", ")}`);
  if (env.WORKER_REQUIRE_GPU === "1" && name === "swiftshader") throw new Error("WORKER_REQUIRE_GPU=1 refuses the swiftshader profile");
  return name;
}

/**
 * The kinds a worker claims: the render kinds unless WORKER_KINDS says otherwise. Conversions
 * (ADR 0006) go to a CPU pool that names `convert`; no worker converts unless told to.
 */
function kindsFrom(env) {
  const known = [...RENDERABLE_KINDS, CONVERT_KIND];
  const kinds = [...new Set(list(env.WORKER_KINDS || RENDERABLE_KINDS.join(",")))];
  const unknown = kinds.filter((kind) => !known.includes(kind));
  if (unknown.length) throw new Error(`WORKER_KINDS: this worker does ${known.join(", ")}, not ${unknown.join(", ")}`);
  if (!kinds.length) throw new Error(`WORKER_KINDS names no kind; leave it unset for ${RENDERABLE_KINDS.join(", ")}`);
  return kinds;
}

function workerIdFrom(env) {
  const id = env.WORKER_ID || os.hostname().replace(/[^A-Za-z0-9._:-]+/g, "-").slice(0, 60) || "worker";
  if (!WORKER_ID.test(id)) throw new Error("WORKER_ID: up to 60 letters, digits, dots, dashes, underscores or colons");
  return id;
}

/** The harness runs next to the worker, on loopback: a secure context, as WebGPU needs, and the sink's neighbour. */
function harnessFrom(env) {
  if (!env.HARNESS_BASE_URL) {
    if (!env.WORKER_APP_DIR) throw new Error("set HARNESS_BASE_URL (a running worker build) or WORKER_APP_DIR (a built one to start)");
    return { harnessUrl: null, appDir: path.resolve(env.WORKER_APP_DIR) };
  }
  const url = new URL(env.HARNESS_BASE_URL);
  if (!["http:", "https:"].includes(url.protocol) || !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error("HARNESS_BASE_URL must be on loopback (http://127.0.0.1:<port>): WebGPU needs a secure context");
  }
  return { harnessUrl: url.origin, appDir: null };
}

/**
 * The worker's settings, from its environment (scripts/render-worker/README.md lists them).
 * Throws with every problem at once.
 */
export function readConfig(env = process.env, platform = process.platform) {
  const problems = [];
  const read = (reader) => {
    try {
      return reader();
    } catch (error) {
      problems.push(error.message);
      return undefined;
    }
  };
  const cacheDir = path.resolve(env.WORKER_CACHE_DIR || path.join(os.tmpdir(), "render-worker-cache"));
  const config = {
    apiUrl: read(() => required(env, "RENDER_API_URL")),
    workerToken: read(() => workerTokenFrom(env)),
    profileName: read(() => profileFrom(env, platform)),
    kinds: read(() => kindsFrom(env)),
    workerId: read(() => workerIdFrom(env)),
    ...read(() => harnessFrom(env)),
    harnessPort: read(() => integer(env, "WORKER_HARNESS_PORT", 3000)),
    slots: read(() => integer(env, "WORKER_SLOTS", 1)),
    pollMs: read(() => integer(env, "WORKER_POLL_SECONDS", 5) * 1000),
    recycleAfterJobs: read(() => integer(env, "WORKER_RECYCLE_JOBS", 50)),
    sandbox: env.WORKER_CHROMIUM_SANDBOX !== "0",
    assetPrefixes: read(() => [...DEFAULT_ASSET_PREFIXES, ...list(env.WORKER_ASSET_ORIGINS).map(assetPrefix)]),
    cacheDir,
    cacheMaxBytes: read(() => integer(env, "WORKER_CACHE_MAX_MB", 2048) * 1024 * 1024),
    /** The converters' vendored files (vendor.mjs); the image has them in its read-only root. */
    vendorDir: path.resolve(env.WORKER_VENDOR_DIR || path.join(cacheDir, "vendor")),
    tmpDir: path.resolve(env.WORKER_TMP_DIR || os.tmpdir()),
    ffmpegPath: env.WORKER_FFMPEG || "ffmpeg",
  };
  if (problems.length) throw new Error(`render worker: ${problems.join("; ")}`);
  return config;
}

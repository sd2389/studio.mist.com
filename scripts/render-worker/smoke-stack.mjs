import { spawn } from "node:child_process";
import { createWriteStream, existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

/*
 * What the worker's smoke tests (smoke.mjs, smoke-convert.mjs) start on this machine and stop at
 * the end: an API on a throwaway SQLite database with local storage, the worker build of the app,
 * render workers. Each process logs to the smoke's folder and runs in its own process group, so a
 * signal reaches it and everything it started.
 */

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const BACKEND = path.join(ROOT, "backend");
/** The swiftshader profile runs anywhere; WORKER_GPU=metal tries the Mac's GPU instead. */
export const PROFILE = process.env.WORKER_GPU || "swiftshader";
const JOB_TIMEOUT_MS = 10 * 60_000;

/** Every process started, in order. */
const started = [];

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The first port from `from` up that nothing listens on. */
export async function freePort(from) {
  for (let port = from; port < from + 100; port += 1) {
    const free = await new Promise((resolve) => {
      const server = net.createServer().once("error", () => resolve(false));
      server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
    });
    if (free) return port;
  }
  throw new Error(`no free port from ${from}`);
}

/** Starts a process whose output goes to `<work>/<name>.log`; `stopAll` stops it. */
export function start(name, command, args, { cwd = ROOT, env, logDir }) {
  const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"], detached: true });
  const out = createWriteStream(path.join(logDir, `${name}.log`));
  child.stdout.pipe(out);
  child.stderr.pipe(out);
  const exited = new Promise((resolve) => child.once("exit", (code, signal) => resolve(code ?? signal)));
  const entry = { name, child, exited, logFile: path.join(logDir, `${name}.log`) };
  started.push(entry);
  return entry;
}

/** Signals a process and everything it started (its process group). */
export function signal(entry, name) {
  try {
    process.kill(-entry.child.pid, name);
  } catch {
    // Gone already.
  }
}

export async function stopAll() {
  await Promise.all(
    started.map(async (entry) => {
      if (entry.child.exitCode !== null || entry.child.signalCode !== null) return;
      signal(entry, "SIGTERM");
      const timer = setTimeout(() => signal(entry, "SIGKILL"), 10_000);
      await entry.exited;
      clearTimeout(timer);
    }),
  );
}

/** The last lines each process logged, for a smoke that failed. */
export function printLogs() {
  for (const entry of started) {
    const text = readFileSync(entry.logFile, "utf8").trim().split("\n").slice(-25).join("\n");
    console.log(`--- ${entry.name} (last lines of ${entry.logFile})\n${text}`);
  }
}

/** Runs a command to its end; its output, or an error with it. */
export async function run(command, args, options) {
  const entry = start(`${path.basename(command)}-${started.length}`, command, args, options);
  const code = await entry.exited;
  const output = await readFile(entry.logFile, "utf8");
  if (code !== 0) throw new Error(`${command} ${args.join(" ")} exited ${code}:\n${output}`);
  return output;
}

export async function waitForHttp(url, entry, timeoutMs = 120_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (entry.child.exitCode !== null) throw new Error(`${entry.name} exited ${entry.child.exitCode}`);
    const ok = await fetch(url, { signal: AbortSignal.timeout(5000) }).then((response) => response.ok, () => false);
    if (ok) return;
    await sleep(500);
  }
  throw new Error(`${url} never answered`);
}

/** Calls the API as a signed-in user: JSON in and out, or the bytes of a file. */
export function api(baseUrl, token) {
  return async (method, route, body) => {
    const response = await fetch(`${baseUrl}${route}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) throw new Error(`${method} ${route}: ${response.status} ${await response.text()}`);
    return response.headers.get("content-type")?.includes("json") ? response.json() : Buffer.from(await response.arrayBuffer());
  };
}

/** Polls the job until it ends; `onChange` hears every status (and error code) it passes through. */
export async function waitForJob(call, id, onChange = () => {}) {
  const until = Date.now() + JOB_TIMEOUT_MS;
  let last = "";
  while (Date.now() < until) {
    const job = await call("GET", `/render-jobs/${id}`);
    const seen = `${job.status}${job.error_code ? ` (${job.error_code})` : ""}`;
    if (seen !== last) onChange(job, seen);
    last = seen;
    if (["completed", "failed", "canceled"].includes(job.status)) return job;
    await sleep(500);
  }
  throw new Error(`job ${id} did not end within ${JOB_TIMEOUT_MS / 60_000} min`);
}

/** The backend's virtualenv: backend/.venv, or WORKER_SMOKE_PYTHON. */
export function smokePython() {
  if (process.env.WORKER_SMOKE_PYTHON) return process.env.WORKER_SMOKE_PYTHON;
  const venv = path.join(BACKEND, ".venv/bin/python");
  return existsSync(venv) ? venv : "python3";
}

/** The API's settings for a smoke: a throwaway SQLite database and local storage in `workDir`. */
export function backendEnv({ workDir, workerToken, leaseSeconds = 120 }) {
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    APP_ENV: "development",
    DATABASE_URL: `sqlite:///${path.join(workDir, "smoke.db")}`,
    STORAGE_BACKEND: "local",
    UPLOAD_DIR: path.join(workDir, "uploads"),
    RENDER_WORKER_TOKEN: workerToken,
    RENDER_JOB_LEASE_SECONDS: String(leaseSeconds),
    AI_BACKGROUND_MODE: "stub",
  };
}

/** Seeds the database (`seed`: a backend module and its arguments, printing JSON last), then starts the API. */
export async function startBackend({ workDir, port, python, env, seed }) {
  const seedOutput = await run(python, ["-m", ...seed], { cwd: BACKEND, env, logDir: workDir });
  const seeded = JSON.parse(seedOutput.trim().split("\n").at(-1));
  const backend = start("backend", python, ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(port)], { cwd: BACKEND, env, logDir: workDir });
  const url = `http://127.0.0.1:${port}`;
  await waitForHttp(`${url}/health`, backend);
  return { url, seed: seeded };
}

/** The worker build of the app, `next start`ed on loopback; HARNESS_BASE_URL names one running already. */
export async function startWorkerApp({ workDir, port, apiUrl }) {
  if (process.env.HARNESS_BASE_URL) return process.env.HARNESS_BASE_URL.replace(/\/+$/, "");
  const distDir = process.env.NEXT_BUILD_DIR || ".next";
  if (!existsSync(path.join(ROOT, distDir, "server/app/render-harness/page.js"))) {
    throw new Error(`no worker build in ${distDir}: run \`BUILD_TARGET=worker npm run build\` first (or set HARNESS_BASE_URL)`);
  }
  const env = { ...process.env, BUILD_TARGET: "worker", NEXT_TELEMETRY_DISABLED: "1", API_URL: apiUrl };
  const app = start("worker-app", process.execPath, [path.join(ROOT, "node_modules/next/dist/bin/next"), "start", "-p", String(port), "-H", "127.0.0.1"], { env, logDir: workDir });
  const url = `http://127.0.0.1:${port}`;
  await waitForHttp(`${url}/render-harness?mode=probe`, app);
  return url;
}

/** A render worker on the smoke's API and harness, polling every second; `env` adds settings. */
export function startWorker(name, { workDir, apiUrl, harnessUrl, workerToken, env = {} }) {
  const workerEnv = {
    ...process.env,
    RENDER_API_URL: apiUrl,
    RENDER_WORKER_TOKEN: workerToken,
    HARNESS_BASE_URL: harnessUrl,
    WORKER_GPU: PROFILE,
    WORKER_ID: name,
    WORKER_POLL_SECONDS: "1",
    WORKER_CACHE_DIR: path.join(workDir, "asset-cache"),
    WORKER_TMP_DIR: workDir,
    ...env,
  };
  return start(name, process.execPath, [path.join(ROOT, "scripts/render-worker/worker.mjs")], { env: workerEnv, logDir: workDir });
}

/** Stops what the smoke started when it is interrupted: its processes run in their own groups, so a Ctrl-C reaches only it. */
export function stopOnInterrupt(log) {
  process.once("SIGINT", () => {
    log("interrupted; stopping what it started");
    stopAll().then(() => process.exit(130));
  });
}

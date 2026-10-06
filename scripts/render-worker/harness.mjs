import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { browserEnv } from "./browser.mjs";

const STARTUP_TIMEOUT_MS = 60_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function answers(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    await response.arrayBuffer();
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Starts the worker's build of the app (`BUILD_TARGET=worker`, Next's standalone `server.js` in
 * `appDir`) on `http://127.0.0.1:<port>`: WebGPU and WebCodecs exist only in a secure context, so
 * the harness is served on loopback, never from another host over plain HTTP. Resolves once it
 * answers `/render-harness?mode=probe`; `exited` settles if it ever stops.
 */
export async function startHarness({ appDir, port, log }) {
  if (!existsSync(path.join(appDir, "server.js"))) {
    throw new Error(`WORKER_APP_DIR: ${appDir} has no server.js (a standalone BUILD_TARGET=worker build)`);
  }
  const url = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["server.js"], {
    cwd: appDir,
    // Not the worker's secrets: the app needs none of them.
    env: { ...browserEnv(), NODE_ENV: "production", PORT: String(port), HOSTNAME: "127.0.0.1", NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const relay = (stream) => stream.on("data", (chunk) => {
    for (const line of chunk.toString("utf8").split("\n")) if (line.trim()) log(`harness: ${line}`);
  });
  relay(child.stdout);
  relay(child.stderr);
  const exited = new Promise((resolve) => child.once("exit", (code, signal) => resolve({ code, signal })));

  const startedAt = Date.now();
  while (!(await answers(`${url}/render-harness?mode=probe`))) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(`the harness server exited (${child.exitCode ?? child.signalCode})`);
    if (Date.now() - startedAt > STARTUP_TIMEOUT_MS) {
      child.kill("SIGKILL");
      throw new Error(`the harness server did not answer on ${url} within ${STARTUP_TIMEOUT_MS / 1000} s`);
    }
    await sleep(500);
  }
  log(`harness: serving ${url}`);
  return {
    url,
    exited,
    async stop() {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill("SIGTERM");
      const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
      await exited;
      clearTimeout(timer);
    },
  };
}

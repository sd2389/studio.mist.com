/*
 * What a job's page may reach (ADR 0005, "Isolation"): the harness it runs in, its job's sink,
 * the job's own inputs, the asset hosts and the converters' vendored files (vendor.mjs).
 * Everything else is aborted. The page never holds the job's token: the job-token routes it asks
 * for on the harness origin are fetched by the worker, which adds the token, and the reply handed
 * to the page.
 */

function prefixOf(value) {
  const trimmed = value.trim();
  const url = new URL(trimmed);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error(`${trimmed}: not an http(s) URL`);
  return url.pathname === "/" && !trimmed.endsWith("/") ? `${url.origin}/` : url.href;
}

/**
 * An allowlisted URL prefix, which the worker fetches for the page: an origin alone
 * (`https://assets.example.com`) allows everything on that origin, but not
 * `https://assets.example.com.evil.test`. `<prefix>=<from>` fetches what the page asks for
 * under `prefix` from `from` instead: in Compose the catalogue's URLs name the API as the
 * browser reaches it (`http://localhost:8765/files/`), the worker as `http://backend:8765/files/`.
 *
 * @returns {{ prefix: string, from: string }}
 */
export function assetPrefix(value) {
  const [prefix, from = prefix] = value.split(/=(?=https?:)/);
  return { prefix: prefixOf(prefix), from: prefixOf(from) };
}

/** Draco's decoder, which drei's `useGLTF` loads for a compressed model (versioned, immutable). */
export const DEFAULT_ASSET_PREFIXES = [assetPrefix("https://www.gstatic.com/draco/")];

/** Where the worker fetches an allowlisted asset the page asked for; null for one off the allowlist. */
export function assetSource(rawUrl, assetPrefixes) {
  const entry = assetPrefixes.find(({ prefix }) => rawUrl.startsWith(prefix));
  return entry ? `${entry.from}${rawUrl.slice(entry.prefix.length)}` : null;
}

/**
 * The page's rules for one job.
 *
 * @param {object} options
 * @param {string} options.harnessOrigin
 * @param {string | null} [options.sinkOrigin]
 * @param {number | null} [options.jobId] The job whose `/render-jobs/<id>/inputs/<name>` routes the page may read.
 * @param {string[]} [options.inputUrls] The job's signed inputs the page loads itself (a background image).
 * @param {{ prefix: string, from: string }[]} [options.assetPrefixes]
 * @param {Iterable<string>} [options.vendoredUrls] The URLs of the converters' vendored files.
 */
export function pagePolicy({ harnessOrigin, sinkOrigin = null, jobId = null, inputUrls = [], assetPrefixes = DEFAULT_ASSET_PREFIXES, vendoredUrls = [] }) {
  return {
    harnessOrigin: new URL(harnessOrigin).origin,
    sinkOrigin: sinkOrigin ? new URL(sinkOrigin).origin : null,
    jobInput: jobId === null ? null : new RegExp(`^/render-jobs/${jobId}/inputs/[a-z]+$`),
    inputUrls: new Set(inputUrls.map((url) => new URL(url).href)),
    assetPrefixes,
    vendored: new Set(vendoredUrls),
  };
}

/**
 * Where a page request goes: `continue` (the harness, the sink), `job-input` (a job-token route,
 * fetched by the worker), `input` (one of the job's signed inputs, fetched by the worker), `asset`
 * (a vendored file, or from the disk cache) or `abort`.
 */
export function routeFor(rawUrl, method, policy) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return "abort";
  }
  if (url.protocol === "data:" || url.protocol === "blob:") return "continue";
  if (url.origin === policy.harnessOrigin) {
    // The API's job routes, which the page reaches as paths on the harness: this job's inputs only.
    if (!url.pathname.startsWith("/render-jobs/")) return "continue";
    return method === "GET" && policy.jobInput?.test(url.pathname) && !url.search ? "job-input" : "abort";
  }
  if (url.origin === policy.sinkOrigin) return "continue";
  if (method !== "GET") return "abort";
  if (policy.inputUrls.has(url.href)) return "input";
  if (policy.vendored.has(url.href) || assetSource(url.href, policy.assetPrefixes)) return "asset";
  return "abort";
}

/** A URL without its query, which may hold a signature: what the log shows. */
export const withoutQuery = (rawUrl) => {
  try {
    const url = new URL(rawUrl);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "(unparsable URL)";
  }
};

/** Same-origin and cross-origin fetches alike may read what the worker hands the page. */
const FULFIL_HEADERS = { "access-control-allow-origin": "*", "cache-control": "no-store" };

/**
 * Applies `policy` to every request and WebSocket of `context`.
 *
 * @param {import("playwright").BrowserContext} context
 * @param {object} options
 * @param {ReturnType<typeof pagePolicy>} options.policy
 * @param {{ get(url: string): Promise<{ path: string, contentType: string }> }} options.assets
 * @param {(target: string) => Promise<{ body: Buffer, contentType: string }>} [options.readInput]
 *   Reads a job-token route or a signed input, as the worker (the job's `read`).
 * @param {(error: Error) => void} [options.onInputError] Told when reading an input failed (a lost job).
 * @param {(error: Error, url: string) => void} [options.onAssetError] Told when an asset couldn't be had.
 * @param {(message: string) => void} [options.log]
 */
export async function guardContext(context, { policy, assets, readInput = null, onInputError = () => {}, onAssetError = () => {}, log = () => {} }) {
  const blocked = [];
  const fulfilInput = async (route, target) => {
    if (!readInput) return route.abort("blockedbyclient");
    try {
      const { body, contentType } = await readInput(target);
      return await route.fulfill({ status: 200, body, headers: { ...FULFIL_HEADERS, "content-type": contentType } });
    } catch (error) {
      onInputError(error);
      log(`input ${withoutQuery(target)} failed: ${error.message}`);
      return route.fulfill({ status: error.status ?? 502, body: "", headers: FULFIL_HEADERS });
    }
  };
  const fulfilAsset = async (route, url) => {
    try {
      const file = await assets.get(policy.vendored.has(url) ? url : assetSource(url, policy.assetPrefixes));
      return await route.fulfill({ status: 200, path: file.path, headers: { ...FULFIL_HEADERS, "content-type": file.contentType } });
    } catch (error) {
      onAssetError(error, url);
      log(`asset ${withoutQuery(url)} failed: ${error.message}`);
      return error.status ? route.fulfill({ status: error.status, body: "", headers: FULFIL_HEADERS }) : route.abort("failed");
    }
  };

  const handle = async (route) => {
    const request = route.request();
    const url = request.url();
    const where = routeFor(url, request.method(), policy);
    if (where === "continue") return route.continue();
    if (where === "job-input") return fulfilInput(route, new URL(url).pathname);
    if (where === "input") return fulfilInput(route, url);
    if (where === "asset") return fulfilAsset(route, url);
    blocked.push(`${request.method()} ${withoutQuery(url)}`);
    log(`blocked ${request.method()} ${withoutQuery(url)}`);
    return route.abort("blockedbyclient");
  };
  await context.route("**/*", (route) =>
    handle(route).catch((error) => {
      // A request still in flight when its job's context closes has nowhere to go.
      if (!/has been closed|already handled/i.test(error.message)) log(`route ${withoutQuery(route.request().url())}: ${error.message}`);
    }),
  );
  // A production page opens none; a dev server's hot reload talks to the harness origin.
  await context.routeWebSocket(
    () => true,
    (socket) => {
      if (new URL(socket.url()).host === new URL(policy.harnessOrigin).host) {
        socket.connectToServer();
        return;
      }
      blocked.push(`WebSocket ${withoutQuery(socket.url())}`);
      log(`blocked WebSocket ${withoutQuery(socket.url())}`);
      socket.close({ code: 1008, reason: "not allowed" });
    },
  );
  return { blocked };
}

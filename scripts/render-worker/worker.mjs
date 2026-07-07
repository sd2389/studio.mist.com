import { BASE_URL, launchDeterministicBrowser } from "../golden/browser.mjs";

const API = process.env.RENDER_API_URL ?? "http://localhost:8765";
const TOKEN = process.env.RENDER_WORKER_TOKEN;
const ONCE = process.argv.includes("--once");
const POLL_MS = 5000;
const JOB_TIMEOUT_MS = 15 * 60 * 1000;

if (!TOKEN) { console.error("RENDER_WORKER_TOKEN required"); process.exit(1); }

async function claim() {
  const res = await fetch(`${API}/render-jobs/claim`, { method: "POST", headers: { "X-Worker-Token": TOKEN } });
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`claim: ${res.status}`);
  return res.json();
}

async function runJob(browser, { job_id, page_token }) {
  const context = await browser.newContext({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  try {
    await page.goto(`${BASE_URL}/render-harness?job=${job_id}&token=${encodeURIComponent(page_token)}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__JOB_STATE__ === "done" || String(window.__JOB_STATE__).startsWith("error"),
      { timeout: JOB_TIMEOUT_MS },
    );
    const state = await page.evaluate(() => window.__JOB_STATE__);
    console.log(`job ${job_id}: ${state}`);
  } finally {
    await context.close();
  }
}

async function main() {
  const browser = await launchDeterministicBrowser();
  try {
    for (;;) {
      const job = await claim().catch((e) => { console.error(e.message); return null; });
      if (job) await runJob(browser, job).catch((e) => console.error(`job ${job.job_id}: ${e.message}`));
      else if (ONCE) break;
      if (ONCE && job) break;
      if (!job) await new Promise((r) => setTimeout(r, POLL_MS));
    }
  } finally {
    await browser.close();
  }
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });

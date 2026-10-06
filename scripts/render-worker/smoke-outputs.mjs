import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { unzipSync } from "fflate";
import { PNG } from "pngjs";
import { ssim } from "ssim.js";
import { launchBrowser, PAGE_VIEWPORT } from "./browser.mjs";
import { spinFileNames } from "./outputs.mjs";

/*
 * What `npm run worker:smoke` checks of a turntable's MP4 and a spin's ZIP (ADR 0005, B3): the MP4
 * is H.264 High, yuv420p and BT.709 with every frame and its index first, Chrome plays it, and its
 * frame 0 as Chrome draws it is the still of the same camera; the ZIP opens, and its spin.html
 * loads every frame and turns. Each check runs in a browser of the smoke's own profile.
 */

const execFileAsync = promisify(execFile);
/** Frame 0 against the still of the same camera: ADR 0005's acceptance for B3. */
const MIN_FRAME_SSIM = 0.97;
const TYPES = { ".html": "text/html", ".jpg": "image/jpeg", ".png": "image/png", ".mp4": "video/mp4" };

export function decodePng(buffer) {
  const png = PNG.sync.read(buffer);
  return { data: new Uint8ClampedArray(png.data), width: png.width, height: png.height };
}

const fromDataUrl = (url) => decodePng(Buffer.from(url.slice(url.indexOf(",") + 1), "base64"));

/** The mean difference of each colour channel, 0 to 255, between two images of one size. */
function meanChannelDifference(a, b) {
  const sums = [0, 0, 0];
  for (let index = 0; index < a.data.length; index += 4) {
    for (let channel = 0; channel < 3; channel += 1) sums[channel] += Math.abs(a.data[index + channel] - b.data[index + channel]);
  }
  return sums.map((sum) => sum / (a.width * a.height));
}

/** An MP4's top-level boxes, in order. */
function topLevelBoxes(buffer) {
  const boxes = [];
  for (let at = 0, size = 8; at + 8 <= buffer.length && size >= 8; at += size) {
    size = buffer.readUInt32BE(at);
    boxes.push(buffer.toString("latin1", at + 4, at + 8));
  }
  return boxes;
}

async function probeVideo(file) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error", "-select_streams", "v:0", "-count_frames", "-of", "json",
    "-show_entries", "stream=codec_name,profile,pix_fmt,width,height,color_range,color_space,color_transfer,color_primaries,nb_read_frames,r_frame_rate",
    file,
  ]);
  return JSON.parse(stdout).streams[0];
}

/** A page of its own at `origin` in a fresh browser, serving `files` (name → bytes) from memory. */
async function openServedPage(profile, origin, files) {
  const browser = await launchBrowser(profile);
  const context = await browser.newContext({ viewport: PAGE_VIEWPORT, serviceWorkers: "block" });
  const served = new Set();
  await context.route(`${origin}/**`, (route) => {
    const name = decodeURIComponent(new URL(route.request().url()).pathname.slice(1)) || "index.html";
    if (!files[name]) return route.fulfill({ status: 404, body: "" });
    served.add(name);
    return route.fulfill({ status: 200, contentType: TYPES[path.extname(name)], body: Buffer.from(files[name]) });
  });
  return { browser, page: await context.newPage(), served };
}

/** Chrome plays the clip to its end; resolves with its size, length and frame 0 as Chrome draws it. */
async function playInChrome(mp4, profile) {
  const origin = "http://turntable.smoke";
  const { browser, page } = await openServedPage(profile, origin, { "index.html": "<!doctype html><video muted playsinline></video><canvas></canvas>", "clip.mp4": mp4 });
  try {
    await page.goto(`${origin}/`);
    return await page.evaluate(async () => {
      const video = document.querySelector("video");
      // A blob plays and seeks as a file does, and its frames draw onto a canvas that stays readable.
      video.src = URL.createObjectURL(await (await fetch("/clip.mp4")).blob());
      await new Promise((resolve, reject) => {
        video.onloadeddata = resolve;
        video.onerror = () => reject(new Error(`Chrome can't play the MP4: ${video.error?.code} ${video.error?.message}`));
      });
      const ended = await new Promise((resolve, reject) => {
        video.onended = () => resolve(true);
        setTimeout(() => resolve(false), 30_000);
        video.play().catch(reject);
      });
      // Back to frame 0: headless Chrome draws nothing of a frame it has decoded but not shown.
      video.currentTime = 0;
      await new Promise((resolve) => (video.onseeked = resolve));
      const canvas = document.querySelector("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d").drawImage(video, 0, 0);
      return { width: video.videoWidth, height: video.videoHeight, duration: video.duration, ended, frame0: canvas.toDataURL("image/png") };
    });
  } finally {
    await browser.close();
  }
}

/**
 * The turntable's MP4 is what ADR 0005 asks for and plays in Chrome, frame 0 matching `still`, the
 * decoded still of the same camera at the same size. Throws with what is wrong; resolves with
 * what it found.
 */
export async function checkTurntable({ mp4, spec, still, profile, workDir }) {
  const file = path.join(workDir, "turntable.mp4");
  await writeFile(file, mp4);
  const stream = await probeVideo(file);
  const expected = {
    codec_name: "h264", profile: "High", pix_fmt: "yuv420p", width: spec.width, height: spec.height,
    color_range: "tv", color_space: "bt709", color_transfer: "bt709", color_primaries: "bt709",
    nb_read_frames: String(spec.frames), r_frame_rate: `${spec.fps}/1`,
  };
  const wrong = Object.entries(expected).filter(([key, value]) => stream[key] !== value);
  if (wrong.length) throw new Error(`the MP4 has ${wrong.map(([key, value]) => `${key} ${stream[key]}, not ${value}`).join("; ")}`);
  const boxes = topLevelBoxes(mp4);
  if (!(boxes.includes("moov") && boxes.indexOf("moov") < boxes.indexOf("mdat"))) throw new Error(`the MP4's boxes are ${boxes.join(", ")}: its index isn't first`);

  const played = await playInChrome(mp4, profile);
  if (!played.ended || played.width !== spec.width || played.height !== spec.height) {
    throw new Error(`Chrome played ${played.width}x${played.height}, ${played.duration} s, ${played.ended ? "to the end" : "not to the end"}`);
  }
  const frame0 = fromDataUrl(played.frame0);
  const similarity = ssim(frame0, still).mssim;
  if (similarity < MIN_FRAME_SSIM) throw new Error(`frame 0 against the still: SSIM ${similarity.toFixed(4)}, under ${MIN_FRAME_SSIM}`);
  return { stream, boxes, duration: played.duration, similarity, colourDifference: meanChannelDifference(frame0, still) };
}

/** Chrome opens the spin's viewer from its files; resolves with what it loaded and whether it turned. */
async function turnInChrome(files, profile) {
  const origin = "http://spin.smoke";
  const { browser, page, served } = await openServedPage(profile, origin, files);
  try {
    await page.goto(`${origin}/spin.html`);
    await page.waitForSelector("#loader.done", { timeout: 60_000 });
    // What the page shows: a screenshot has headless Chrome draw frames, as a visible tab does.
    const view = () => page.locator("#view").screenshot();
    const first = await view();
    await page.waitForTimeout(500);
    const autoplayed = await view();
    // Paused, then a frame on with the arrow key.
    await page.click("#play");
    const paused = await view();
    await page.focus("#stage");
    await page.keyboard.press("ArrowRight");
    const stepped = await view();
    const image = decodePng(first);
    const isBlank = image.data.every((value, index) => value === image.data[index % 4]);
    return { served: [...served], turnsByItself: !autoplayed.equals(first), turnsByKey: !stepped.equals(paused), isBlank };
  } finally {
    await browser.close();
  }
}

/** The spin's ZIP opens, holds its frames and viewer page, and the viewer loads every frame and turns. */
export async function checkSpin({ zip, spec, profile }) {
  const files = unzipSync(zip);
  const names = Object.keys(files);
  const expected = spinFileNames(spec);
  if (names.join() !== expected.join()) throw new Error(`the ZIP holds ${names.join(", ")}, not ${expected.join(", ")}`);
  const magic = spec.format === "jpeg" ? [0xff, 0xd8, 0xff] : [0x89, 0x50, 0x4e, 0x47];
  const notImages = names.slice(0, -1).filter((name) => !magic.every((byte, index) => files[name][index] === byte));
  if (notImages.length) throw new Error(`not ${spec.format} images: ${notImages.join(", ")}`);

  const viewer = await turnInChrome(files, profile);
  const missed = names.filter((name) => !viewer.served.includes(name));
  if (missed.length || viewer.isBlank || !viewer.turnsByItself || !viewer.turnsByKey) {
    throw new Error(`spin.html: missed ${missed.join(", ") || "nothing"}, ${viewer.isBlank ? "blank" : "drawn"}, turns by itself ${viewer.turnsByItself}, by key ${viewer.turnsByKey}`);
  }
  return { entries: names.length, bytes: zip.length };
}

/**
 * Self-contained 360° viewer for a JPG frame sequence: no dependencies, one inline script,
 * works from file:// (frames are relative paths next to the page).
 */

export type SpinViewerMetal = { slug: string; label: string; frames: string[] };

export type SpinViewerInput = {
  title: string;
  metals: SpinViewerMetal[];
  /** Pixel size of the (square) frames. */
  size: number;
  /** Autoplay speed; 72 frames at 18 fps is a calm 4 s turn. */
  autoplayFps?: number;
};

export type SpinViewerData = Required<SpinViewerInput>;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** JSON that is safe inside an inline <script> (no `</script>`, no JS line terminators). */
export function scriptSafeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

const STYLE = `
*{box-sizing:border-box}
html,body{margin:0;height:100%}
body{font:14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:#f4f2ee;color:#1f1f1f;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:16px}
h1{margin:0;font-size:13px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#6b6b6b;text-align:center}
.stage{position:relative;width:min(92vw,calc(100vh - 150px));max-width:1080px;aspect-ratio:1/1;background:#fff;border-radius:14px;box-shadow:0 1px 2px rgba(0,0,0,.06),0 12px 40px rgba(0,0,0,.08);overflow:hidden;cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;outline:none}
.stage:focus-visible{box-shadow:0 0 0 3px rgba(0,0,0,.35)}
.stage.dragging{cursor:grabbing}
canvas{display:block;width:100%;height:100%}
.loader{position:absolute;inset:auto 0 0 0;padding:14px 18px;background:linear-gradient(transparent,rgba(255,255,255,.92));font-size:12px;color:#555;transition:opacity .3s}
.loader.done{opacity:0;pointer-events:none}
.bar{height:3px;margin-top:6px;background:rgba(0,0,0,.08);border-radius:3px;overflow:hidden}
.bar i{display:block;height:100%;width:0;background:#1f1f1f;transition:width .15s}
.hint{position:absolute;top:12px;left:50%;transform:translateX(-50%);padding:5px 10px;border-radius:999px;background:rgba(0,0,0,.55);color:#fff;font-size:11px;letter-spacing:.04em;transition:opacity .4s;pointer-events:none}
.hint.hidden{opacity:0}
.controls{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:center}
button{font:inherit;font-size:12px;border:1px solid rgba(0,0,0,.14);background:#fff;color:#1f1f1f;padding:7px 14px;border-radius:999px;cursor:pointer}
button:hover{border-color:rgba(0,0,0,.35)}
button[aria-pressed="true"]{background:#1f1f1f;border-color:#1f1f1f;color:#fff}
.metals{display:flex;flex-wrap:wrap;gap:6px;justify-content:center}
`;

const SCRIPT = `
(function () {
  "use strict";
  var DATA = __DATA__;
  var stage = document.getElementById("stage");
  var canvas = document.getElementById("view");
  var ctx = canvas.getContext("2d");
  var loader = document.getElementById("loader");
  var loaderText = document.getElementById("loader-text");
  var loaderBar = document.getElementById("loader-bar");
  var hint = document.getElementById("hint");
  var playButton = document.getElementById("play");
  var metalBox = document.getElementById("metals");
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var state = { metal: 0, frame: 0, playing: !reduceMotion, velocity: 0, drag: null, last: 0 };
  var cache = DATA.metals.map(function () { return null; });

  function frameCount() { return DATA.metals[state.metal].frames.length; }
  function wrap(i, n) { return ((i % n) + n) % n; }

  function load(metalIndex, onProgress) {
    if (cache[metalIndex]) return cache[metalIndex];
    var paths = DATA.metals[metalIndex].frames;
    var entry = { images: [], loaded: 0, total: paths.length };
    cache[metalIndex] = entry;
    paths.forEach(function (src, i) {
      var img = new Image();
      img.decoding = "async";
      img.onload = img.onerror = function () {
        img.ready = img.naturalWidth > 0;
        entry.loaded += 1;
        if (onProgress) onProgress(entry);
        if (metalIndex === state.metal) draw();
      };
      img.src = src;
      entry.images[i] = img;
    });
    return entry;
  }

  function nearestReady(entry, index) {
    for (var step = 0; step < entry.total; step++) {
      var a = entry.images[wrap(index + step, entry.total)];
      if (a && a.ready) return a;
      var b = entry.images[wrap(index - step, entry.total)];
      if (b && b.ready) return b;
    }
    return null;
  }

  function draw() {
    var entry = cache[state.metal];
    if (!entry) return;
    var img = nearestReady(entry, wrap(Math.round(state.frame), entry.total));
    if (!img) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  }

  function showProgress(entry) {
    var pct = Math.round((entry.loaded / entry.total) * 100);
    loaderText.textContent = "Loading 360\\u00b0 view \\u00b7 " + pct + "%";
    loaderBar.style.width = pct + "%";
    if (entry.loaded >= entry.total) {
      loader.classList.add("done");
      preloadOthers();
    } else {
      loader.classList.remove("done");
    }
  }

  function preloadOthers() {
    DATA.metals.forEach(function (_, i) { if (i !== state.metal) load(i); });
  }

  function setPlaying(playing) {
    state.playing = playing;
    playButton.setAttribute("aria-pressed", playing ? "true" : "false");
    playButton.textContent = playing ? "Pause" : "Play";
  }

  function interact() {
    if (state.playing) setPlaying(false);
    hint.classList.add("hidden");
  }

  function step(delta) {
    state.frame = wrap(state.frame + delta, frameCount());
    draw();
  }

  function tick(now) {
    var dt = state.last ? Math.min(0.1, (now - state.last) / 1000) : 0;
    state.last = now;
    if (!state.drag) {
      if (state.playing) {
        step(DATA.autoplayFps * dt);
      } else if (Math.abs(state.velocity) > 0.02) {
        step(state.velocity * dt * 60);
        state.velocity *= Math.pow(0.9, dt * 60);
      }
    }
    requestAnimationFrame(tick);
  }

  function framesPerPixel() {
    return (frameCount() / Math.max(1, stage.clientWidth)) * 0.9;
  }

  stage.addEventListener("pointerdown", function (e) {
    interact();
    state.drag = { x: e.clientX, t: performance.now() };
    state.velocity = 0;
    stage.classList.add("dragging");
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener("pointermove", function (e) {
    if (!state.drag) return;
    var dx = e.clientX - state.drag.x;
    var now = performance.now();
    var delta = -dx * framesPerPixel();
    state.velocity = delta / Math.max(1, (now - state.drag.t) / 16.7);
    state.drag = { x: e.clientX, t: now };
    step(delta);
  });
  function endDrag() {
    state.drag = null;
    stage.classList.remove("dragging");
  }
  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);
  stage.addEventListener("wheel", function (e) {
    e.preventDefault();
    interact();
    var delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    step(delta * 0.04);
  }, { passive: false });
  stage.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft") { interact(); step(1); e.preventDefault(); }
    else if (e.key === "ArrowRight") { interact(); step(-1); e.preventDefault(); }
    else if (e.key === " ") { setPlaying(!state.playing); e.preventDefault(); }
  });
  playButton.addEventListener("click", function () { setPlaying(!state.playing); });

  function selectMetal(index) {
    state.metal = index;
    Array.prototype.forEach.call(metalBox.children, function (button, i) {
      button.setAttribute("aria-pressed", i === index ? "true" : "false");
    });
    var entry = load(index, showProgress);
    showProgress(entry);
    draw();
  }

  if (DATA.metals.length > 1) {
    DATA.metals.forEach(function (metal, i) {
      var button = document.createElement("button");
      button.type = "button";
      button.textContent = metal.label;
      button.addEventListener("click", function () { selectMetal(i); });
      metalBox.appendChild(button);
    });
  }

  canvas.width = DATA.size;
  canvas.height = DATA.size;
  setPlaying(state.playing);
  selectMetal(0);
  requestAnimationFrame(tick);
})();
`;

export function buildSpinViewerHtml(input: SpinViewerInput): string {
  const data: SpinViewerData = {
    title: input.title,
    metals: input.metals.filter((metal) => metal.frames.length > 0),
    size: Math.max(1, Math.round(input.size)),
    autoplayFps: input.autoplayFps ?? 18,
  };
  const title = escapeHtml(input.title);
  const script = SCRIPT.replace("__DATA__", () => scriptSafeJson(data));
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · 360° view</title>
<style>${STYLE}</style>
</head>
<body>
<h1>${title}</h1>
<div class="stage" id="stage" tabindex="0" role="img" aria-label="${title}, 360 degree view. Drag, scroll or use the arrow keys to rotate.">
<canvas id="view" width="${data.size}" height="${data.size}"></canvas>
<div class="hint" id="hint">Drag to rotate</div>
<div class="loader" id="loader"><span id="loader-text">Loading 360° view</span><div class="bar"><i id="loader-bar"></i></div></div>
</div>
<div class="controls">
<button type="button" id="play" aria-pressed="true">Pause</button>
<div class="metals" id="metals" role="group" aria-label="Metal"></div>
</div>
<script>${script}</script>
</body>
</html>
`;
}

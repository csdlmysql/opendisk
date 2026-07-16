// Dock icon progress ring (macOS) — iOS-app-update style.
// Renders the app icon dimmed with a circular progress ring on a canvas,
// then ships it to Rust (set_dock_icon) which sets it via NSApplication.
// Pure module, no React. No-op outside Tauri.

import { backend, isTauri } from "../api/tauri";

const SIZE = 512;

let baseIcon: HTMLImageElement | null = null;
let loading: Promise<void> | null = null;
let canvas: HTMLCanvasElement | null = null;

let lastPercent = -1;
let lastSentAt = 0;
// Bumped by reset; in-flight updates compare it to drop stale draws that would
// otherwise land AFTER the reset and leave the ring stuck on the icon.
let generation = 0;
// All icon mutations run through this chain, strictly in call order — an update
// can never overtake (or land after) a reset that was requested before it.
let chain: Promise<void> = Promise.resolve();

function enqueue(fn: () => Promise<void>): Promise<void> {
  chain = chain.then(fn, fn);
  return chain;
}

function loadIcon(): Promise<void> {
  if (loading) return loading;
  loading = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      baseIcon = img;
      resolve();
    };
    img.onerror = () => resolve(); // missing icon -> ring on transparent background
    img.src = "/dock-icon.png";
  });
  return loading;
}

function draw(fraction: number): string | null {
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.clearRect(0, 0, SIZE, SIZE);
  if (baseIcon) {
    ctx.drawImage(baseIcon, 0, 0, SIZE, SIZE);
    // iOS-update look: dim the icon strongly so the ring is the focal point.
    // source-atop keeps the icon's own alpha (rounded shape stays intact).
    ctx.globalCompositeOperation = "source-atop";
    ctx.fillStyle = "rgba(10, 12, 16, 0.45)";
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.globalCompositeOperation = "source-over";
  }

  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const r = SIZE * 0.24;
  const start = -Math.PI / 2;
  const frac = Math.max(0.01, Math.min(1, fraction));

  // Ring track — clearly visible against the dimmed icon.
  ctx.lineWidth = SIZE * 0.06;
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  // Progress arc — solid white with a soft shadow for depth.
  ctx.strokeStyle = "#ffffff";
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = SIZE * 0.015;
  ctx.beginPath();
  ctx.arc(cx, cy, r, start, start + Math.PI * 2 * frac);
  ctx.stroke();
  ctx.shadowBlur = 0;

  return canvas.toDataURL("image/png").split(",")[1] ?? null;
}

/** Update the Dock ring. Throttled: sends only on >=1% change, max ~4 fps. */
export async function updateDockProgress(fraction: number): Promise<void> {
  if (!isTauri()) return;
  const percent = Math.floor(Math.max(0, Math.min(1, fraction)) * 100);
  const now = Date.now();
  if (percent === lastPercent || now - lastSentAt < 250) return;
  lastPercent = percent;
  lastSentAt = now;
  const gen = generation;

  await enqueue(async () => {
    // Re-check at EXECUTION time: if a reset was requested after this frame
    // was queued, drop it — never repaint the ring over the restored icon.
    if (gen !== generation) return;
    await loadIcon();
    const png = draw(fraction);
    if (!png) return;
    try {
      await backend.setDockIcon(png);
    } catch {
      /* dock icon is cosmetic — never break the scan over it */
    }
  });
}

/** Draw the app icon with no dim and no ring — used to clear the progress state.
 *  Restoring the saved original NSImage proved unreliable on the Dock, so we
 *  repaint a clean icon through the same code path the ring frames use. */
function drawClean(): string | null {
  if (!baseIcon) return null;
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.drawImage(baseIcon, 0, 0, SIZE, SIZE);
  return canvas.toDataURL("image/png").split(",")[1] ?? null;
}

/** Clear the ring: repaint the clean app icon (call on cancel/error). */
export async function resetDockProgress(): Promise<void> {
  if (!isTauri()) return;
  generation++; // invalidate every queued/in-flight ring frame first
  lastPercent = -1;
  await enqueue(async () => {
    try {
      await loadIcon();
      const png = drawClean();
      // Fall back to the Rust-side restore if the base icon failed to load.
      await backend.setDockIcon(png ?? null);
    } catch {
      /* ignore */
    }
  });
}

/** Scan finished: show a full 100% ring briefly, then clear to the clean icon. */
export async function completeDockProgress(): Promise<void> {
  if (!isTauri()) return;
  generation++; // drop stale partial frames still in the queue
  const gen = generation;
  lastPercent = -1;
  await enqueue(async () => {
    if (gen !== generation) return;
    await loadIcon();
    const png = draw(1);
    if (!png) return;
    try {
      await backend.setDockIcon(png);
    } catch {
      /* ignore */
    }
  });
  await new Promise((r) => setTimeout(r, 450));
  await resetDockProgress();
}

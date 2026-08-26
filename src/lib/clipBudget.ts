export const MAX_CLIP_SEC = 20;
export const WARN_CLIP_SEC = 10;
export const RECORD_MAX_SEC = 10;
export const PHONE_WARN_SEC = 15;
export const TARGET_FPS = 30;
export const MAX_LONG_EDGE = 1280;
export const MAX_SHORT_EDGE = 720;

export function is4kSize(width: number, height: number): boolean {
  const pixels = width * height;
  return width >= 3800 || height >= 2100 || pixels >= 3840 * 2160 * 0.85;
}

/** 1080p-class (including portrait 1080×1920). Not 4K. */
export function is1080Size(width: number, height: number): boolean {
  if (is4kSize(width, height)) return false;
  const shortEdge = Math.min(width, height);
  const longEdge = Math.max(width, height);
  return shortEdge >= 1000 || longEdge >= 1800;
}

export function fitProcessSize(displayWidth: number, displayHeight: number): {
  width: number;
  height: number;
} {
  const w = Math.max(1, displayWidth);
  const h = Math.max(1, displayHeight);
  const landscape = w >= h;
  const maxW = landscape ? MAX_LONG_EDGE : MAX_SHORT_EDGE;
  const maxH = landscape ? MAX_SHORT_EDGE : MAX_LONG_EDGE;
  const scale = Math.min(1, maxW / w, maxH / h);
  return evenSize(w * scale, h * scale);
}

function evenSize(w: number, h: number): { width: number; height: number } {
  const width = Math.max(2, Math.round(w / 2) * 2);
  const height = Math.max(2, Math.round(h / 2) * 2);
  return { width, height };
}

export function formatEta(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "…";
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 1) return "<1s";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}

/** Keep the last ETA when a later estimate grows — that growth is noise, not more work. */
export function shrinkOnlyEta(prevFrame: number, prevEtaMs: number, frame: number, etaMs: number): number {
  if (frame < prevFrame) return prevEtaMs;
  if (frame === prevFrame) return prevEtaMs;
  if (!Number.isFinite(etaMs) || etaMs < 0) return prevEtaMs > 0 ? prevEtaMs : 0;
  if (!Number.isFinite(prevEtaMs) || prevEtaMs <= 0) return etaMs;
  return Math.min(prevEtaMs, etaMs);
}

export function downloadName(sport: string, mime: string, at = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`;
  const ext = mime.includes("webm") ? "webm" : "mp4";
  return `pathflare-${sport}-${stamp}.${ext}`;
}

export function clipDurationSec(durationSec: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 0;
  return Math.min(durationSec, MAX_CLIP_SEC);
}

export function frameCountFor(durationSec: number, fps = TARGET_FPS): number {
  return Math.max(1, Math.round(clipDurationSec(durationSec) * fps));
}

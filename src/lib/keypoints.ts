import type { Keypoint } from "./types";

export type { Keypoint };

/** Centripetal Catmull-Rom; knot spacing uses frame-index parameterization. */
export const CATMULL_ROM_ALPHA = 0.5;

export type PixelPoint = { x: number; y: number };

export type SampledPoint = PixelPoint & { frame: number };

export function newKeypointId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `kp-${Math.random().toString(36).slice(2, 12)}`;
}

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export function sortKeypoints(keypoints: Keypoint[]): Keypoint[] {
  return [...keypoints].sort((a, b) => a.frame - b.frame || a.id.localeCompare(b.id));
}

export function toPixel(kp: Keypoint, width: number, height: number): PixelPoint {
  return { x: kp.x * width, y: kp.y * height };
}

/**
 * Sample the interpolated glow path at an integer frame.
 * Returns pixel coordinates in the given width×height, or null outside the tagged range.
 *
 * 0 keypoints: no trail.
 * 1 keypoint: glow on that frame only.
 * 2 keypoints: linear in frame index.
 * 3+ keypoints: centripetal Catmull-Rom (α=0.5) through the marks, parameterized by frame.
 */
export function sample(
  keypoints: Keypoint[],
  frame: number,
  width: number,
  height: number,
): PixelPoint | null {
  const pts = sortKeypoints(keypoints);
  if (pts.length === 0) return null;
  const f = Math.round(frame);
  if (pts.length === 1) {
    return f === pts[0].frame ? toPixel(pts[0], width, height) : null;
  }
  const first = pts[0].frame;
  const last = pts[pts.length - 1].frame;
  if (f < first || f > last) return null;
  if (pts.length === 2) {
    return interpolateLinear(pts[0], pts[1], f, width, height);
  }
  return interpolateCatmullRom(pts, f, width, height);
}

/** Integer-frame samples from the first keypoint through the last, inclusive. */
export function samplePath(
  keypoints: Keypoint[],
  width: number,
  height: number,
): SampledPoint[] {
  const pts = sortKeypoints(keypoints);
  if (pts.length === 0) return [];
  if (pts.length === 1) {
    const p = toPixel(pts[0], width, height);
    return [{ frame: pts[0].frame, x: p.x, y: p.y }];
  }
  const first = pts[0].frame;
  const last = pts[pts.length - 1].frame;
  const out: SampledPoint[] = [];
  for (let frame = first; frame <= last; frame++) {
    const p = sample(pts, frame, width, height);
    if (p) out.push({ frame, x: p.x, y: p.y });
  }
  return out;
}

export function trailUpTo(path: SampledPoint[], frame: number): SampledPoint[] {
  if (path.length === 0) return [];
  const first = path[0].frame;
  const last = path[path.length - 1].frame;
  if (frame < first) return [];
  const end = Math.min(frame, last);
  return path.filter((p) => p.frame <= end);
}

export function upsertMark(
  keypoints: Keypoint[],
  frame: number,
  x: number,
  y: number,
): Keypoint[] {
  const f = Math.round(frame);
  const nx = clamp01(x);
  const ny = clamp01(y);
  const existing = keypoints.find((k) => k.frame === f);
  if (existing) {
    return sortKeypoints(keypoints.map((k) => (k.id === existing.id ? { ...k, x: nx, y: ny } : k)));
  }
  return sortKeypoints([
    ...keypoints,
    { id: newKeypointId(), frame: f, x: nx, y: ny },
  ]);
}

export function moveKeypoint(
  keypoints: Keypoint[],
  id: string,
  x: number,
  y: number,
): Keypoint[] {
  return sortKeypoints(
    keypoints.map((k) => (k.id === id ? { ...k, x: clamp01(x), y: clamp01(y) } : k)),
  );
}

export function deleteKeypoint(keypoints: Keypoint[], id: string): Keypoint[] {
  return keypoints.filter((k) => k.id !== id);
}

export function hitTestHandle(
  keypoints: Keypoint[],
  px: number,
  py: number,
  width: number,
  height: number,
  radiusVideoPx: number,
): Keypoint | null {
  let best: Keypoint | null = null;
  let bestD = radiusVideoPx;
  for (const kp of keypoints) {
    const dx = kp.x * width - px;
    const dy = kp.y * height - py;
    const d = Math.hypot(dx, dy);
    if (d <= bestD) {
      best = kp;
      bestD = d;
    }
  }
  return best;
}

export function keypointsEqual(a: Keypoint[], b: Keypoint[]): boolean {
  if (a.length !== b.length) return false;
  const as = sortKeypoints(a);
  const bs = sortKeypoints(b);
  for (let i = 0; i < as.length; i++) {
    const p = as[i];
    const q = bs[i];
    if (p.id !== q.id || p.frame !== q.frame || p.x !== q.x || p.y !== q.y) return false;
  }
  return true;
}

function interpolateLinear(
  a: Keypoint,
  b: Keypoint,
  frame: number,
  width: number,
  height: number,
): PixelPoint {
  const span = b.frame - a.frame;
  const u = span === 0 ? 0 : (frame - a.frame) / span;
  const pa = toPixel(a, width, height);
  const pb = toPixel(b, width, height);
  return {
    x: pa.x + (pb.x - pa.x) * u,
    y: pa.y + (pb.y - pa.y) * u,
  };
}

function interpolateCatmullRom(
  pts: Keypoint[],
  frame: number,
  width: number,
  height: number,
): PixelPoint {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (frame < a.frame || frame > b.frame) continue;
    if (a.frame === b.frame) return toPixel(a, width, height);
    const u = (frame - a.frame) / (b.frame - a.frame);
    const p0 = toPixel(pts[Math.max(0, i - 1)], width, height);
    const p1 = toPixel(a, width, height);
    const p2 = toPixel(b, width, height);
    const p3 = toPixel(pts[Math.min(pts.length - 1, i + 2)], width, height);
    return centripetalCatmullRom(p0, p1, p2, p3, u);
  }
  return toPixel(pts[pts.length - 1], width, height);
}

/**
 * Barry–Goldman centripetal Catmull-Rom between p1 and p2.
 * u is 0..1 in frame-index space on that segment.
 * Endpoints are duplicated by the caller as phantom handles (p0=p1 or p3=p2).
 */
function centripetalCatmullRom(
  p0: PixelPoint,
  p1: PixelPoint,
  p2: PixelPoint,
  p3: PixelPoint,
  u: number,
): PixelPoint {
  const t0 = 0;
  const t1 = chord(t0, p0, p1);
  const t2 = chord(t1, p1, p2);
  const t3 = chord(t2, p2, p3);
  const t = t1 + u * (t2 - t1);
  const a1 = lerpPoint(p0, p1, t0, t1, t);
  const a2 = lerpPoint(p1, p2, t1, t2, t);
  const a3 = lerpPoint(p2, p3, t2, t3, t);
  const b1 = lerpPoint(a1, a2, t0, t2, t);
  const b2 = lerpPoint(a2, a3, t1, t3, t);
  return lerpPoint(b1, b2, t1, t2, t);
}

function chord(ti: number, a: PixelPoint, b: PixelPoint): number {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  return ti + Math.pow(Math.max(d, 1e-6), CATMULL_ROM_ALPHA);
}

function lerpPoint(
  a: PixelPoint,
  b: PixelPoint,
  t0: number,
  t1: number,
  t: number,
): PixelPoint {
  if (Math.abs(t1 - t0) < 1e-12) return { x: a.x, y: a.y };
  const r = (t - t0) / (t1 - t0);
  return {
    x: a.x + (b.x - a.x) * r,
    y: a.y + (b.y - a.y) * r,
  };
}

import type { Point, Preset, TrailSegment } from "../lib/types";

const H_BINS = 16;
const S_BINS = 8;
const V_BINS = 8;
const HIST_LEN = H_BINS + S_BINS + V_BINS;
const MISS_LIMIT = 10;

type Hist = Float32Array;

export type TrackerSeed = {
  x: number;
  y: number;
  customRgb?: [number, number, number];
};

export type TrackResult = {
  point: Point | null;
  lost: boolean;
};

export class ObjectTracker {
  private readonly preset: Preset;
  private readonly kalman = new KalmanCV();
  private template: Float32Array | null = null;
  private templateW = 0;
  private templateH = 0;
  private hist: Hist | null = null;
  private miss = 0;
  private roiBoost = 1;
  private lastT = 0;
  private inited = false;
  readonly segments: TrailSegment[] = [[]];

  constructor(preset: Preset) {
    this.preset = preset;
  }

  seed(frame: ImageData, x: number, y: number, customRgb?: [number, number, number]): void {
    const size = this.preset.templateSize;
    const patch = extractGrayPatch(frame, x, y, size, size);
    this.template = patch.gray;
    this.templateW = patch.w;
    this.templateH = patch.h;
    this.hist = customRgb
      ? histFromColor(customRgb[0], customRgb[1], customRgb[2], extractHist(frame, x, y, size, size))
      : extractHist(frame, x, y, size, size);
    this.kalman.init(x, y);
    this.miss = 0;
    this.roiBoost = 1;
    this.inited = true;
    const seg = this.currentSeg();
    if (seg.length === 0 || dist(seg[seg.length - 1], { x, y }) > 3) {
      seg.push({ x, y, t: this.lastT });
    }
  }

  currentSeg(): Point[] {
    return this.segments[this.segments.length - 1];
  }

  step(frame: ImageData, timestamp: number): TrackResult {
    if (!this.inited || !this.template || !this.hist) {
      return { point: null, lost: true };
    }
    const dt = Math.min(0.08, Math.max(1 / 60, timestamp - this.lastT || 1 / 30));
    this.lastT = timestamp;
    this.kalman.predict(dt, this.preset.processNoise);

    const tw = this.templateW;
    const th = this.templateH;
    let roiScale = this.preset.roiScale * this.roiBoost;
    const searchW = Math.round(tw * roiScale);
    const searchH = Math.round(th * roiScale);
    const cx = this.kalman.x;
    const cy = this.kalman.y;
    const roi = clampRoi(
      Math.round(cx - searchW / 2),
      Math.round(cy - searchH / 2),
      searchW,
      searchH,
      frame.width,
      frame.height,
    );

    const found = search(frame, roi, this.template, tw, th, this.hist, this.preset);
    const gated =
      found &&
      mahalanobis(found.x - cx, found.y - cy, this.kalman.posVar()) < 6.5;

    if (found && found.score >= this.acceptScore() && (this.miss < 2 || gated || this.miss === 0)) {
      this.kalman.update(found.x, found.y, this.preset.measNoise);
      this.miss = 0;
      this.roiBoost = 1;
      if (found.ncc > 0.45) {
        const next = extractGrayPatch(frame, found.x, found.y, tw, th);
        blendTemplate(this.template, next.gray, 0.08);
        blendHist(this.hist, extractHist(frame, found.x, found.y, tw, th), 0.06);
      }
      const pt = { x: this.kalman.x, y: this.kalman.y, t: timestamp };
      this.currentSeg().push(pt);
      return { point: pt, lost: false };
    }

    this.miss += 1;
    this.roiBoost = Math.min(3.2, this.roiBoost * this.preset.missWiden);
    if (this.miss >= MISS_LIMIT) {
      if (this.currentSeg().length > 0) this.segments.push([]);
      return { point: null, lost: true };
    }
    return { point: null, lost: false };
  }

  private acceptScore(): number {
    const p = this.preset;
    return p.nccMin * 0.55 + p.colorMin * 0.35;
  }
}

class KalmanCV {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  P = ident4(80);

  init(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.P = ident4(60);
    this.P[2][2] = 120;
    this.P[3][3] = 120;
  }

  posVar(): number {
    return Math.max(4, (this.P[0][0] + this.P[1][1]) / 2);
  }

  predict(dt: number, processNoise: number): void {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const F = [
      [1, 0, dt, 0],
      [0, 1, 0, dt],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
    ];
    this.P = add4(mul4(mul4(F, this.P), trans4(F)), processQ(dt, processNoise));
  }

  update(zx: number, zy: number, measNoise: number): void {
    const yx = zx - this.x;
    const yy = zy - this.y;
    const r = measNoise;
    const s00 = this.P[0][0] + r;
    const s01 = this.P[0][1];
    const s11 = this.P[1][1] + r;
    const det = s00 * s11 - s01 * s01;
    if (Math.abs(det) < 1e-8) return;
    const inv00 = s11 / det;
    const inv01 = -s01 / det;
    const inv11 = s00 / det;
    const k = [
      [this.P[0][0] * inv00 + this.P[0][1] * inv01, this.P[0][0] * inv01 + this.P[0][1] * inv11],
      [this.P[1][0] * inv00 + this.P[1][1] * inv01, this.P[1][0] * inv01 + this.P[1][1] * inv11],
      [this.P[2][0] * inv00 + this.P[2][1] * inv01, this.P[2][0] * inv01 + this.P[2][1] * inv11],
      [this.P[3][0] * inv00 + this.P[3][1] * inv01, this.P[3][0] * inv01 + this.P[3][1] * inv11],
    ];
    this.x += k[0][0] * yx + k[0][1] * yy;
    this.y += k[1][0] * yx + k[1][1] * yy;
    this.vx += k[2][0] * yx + k[2][1] * yy;
    this.vy += k[3][0] * yx + k[3][1] * yy;
    const IKH = [
      [1 - k[0][0], -k[0][1], 0, 0],
      [-k[1][0], 1 - k[1][1], 0, 0],
      [-k[2][0], -k[2][1], 1, 0],
      [-k[3][0], -k[3][1], 0, 1],
    ];
    this.P = mul4(IKH, this.P);
  }
}

function search(
  frame: ImageData,
  roi: { x: number; y: number; w: number; h: number },
  template: Float32Array,
  tw: number,
  th: number,
  hist: Hist,
  preset: Preset,
): { x: number; y: number; score: number; ncc: number } | null {
  const maxX = roi.x + roi.w - tw;
  const maxY = roi.y + roi.h - th;
  if (maxX < roi.x || maxY < roi.y) return null;

  let best = { x: roi.x + tw / 2, y: roi.y + th / 2, score: -1, ncc: 0 };
  const stride = roi.w > 90 || roi.h > 90 ? 2 : 1;

  for (let y = roi.y; y <= maxY; y += stride) {
    for (let x = roi.x; x <= maxX; x += stride) {
      const ncc = nccAt(frame, x, y, template, tw, th);
      if (ncc < preset.nccMin * 0.65) continue;
      const color = histIntersect(extractHist(frame, x + tw / 2, y + th / 2, tw, th), hist);
      if (color < preset.colorMin * 0.5) continue;
      const circ = circularity(frame, x, y, tw, th, hist, preset.allowEllipse);
      const score =
        ncc * (0.55 + 0.2 * (1 - preset.circularityWeight)) +
        color * 0.3 +
        circ * preset.circularityWeight;
      if (score > best.score) best = { x: x + tw / 2, y: y + th / 2, score, ncc };
    }
  }

  if (stride === 2 && best.score > 0) {
    const refined = refine(frame, best.x, best.y, template, tw, th, hist, preset);
    if (refined.score > best.score) best = refined;
  }
  return best.score > 0 ? best : null;
}

function refine(
  frame: ImageData,
  cx: number,
  cy: number,
  template: Float32Array,
  tw: number,
  th: number,
  hist: Hist,
  preset: Preset,
): { x: number; y: number; score: number; ncc: number } {
  let best = { x: cx, y: cy, score: -1, ncc: 0 };
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const x = Math.round(cx - tw / 2 + dx);
      const y = Math.round(cy - th / 2 + dy);
      if (x < 0 || y < 0 || x + tw > frame.width || y + th > frame.height) continue;
      const ncc = nccAt(frame, x, y, template, tw, th);
      const color = histIntersect(extractHist(frame, x + tw / 2, y + th / 2, tw, th), hist);
      const circ = circularity(frame, x, y, tw, th, hist, preset.allowEllipse);
      const score = ncc * 0.6 + color * 0.28 + circ * preset.circularityWeight;
      if (score > best.score) best = { x: x + tw / 2, y: y + th / 2, score, ncc };
    }
  }
  return best;
}

function nccAt(
  frame: ImageData,
  x: number,
  y: number,
  template: Float32Array,
  tw: number,
  th: number,
): number {
  const data = frame.data;
  const fw = frame.width;
  let sumI = 0;
  let sumI2 = 0;
  let sumIT = 0;
  const n = tw * th;
  let i = 0;
  for (let yy = 0; yy < th; yy++) {
    let row = ((y + yy) * fw + x) * 4;
    for (let xx = 0; xx < tw; xx++) {
      const g = 0.299 * data[row] + 0.587 * data[row + 1] + 0.114 * data[row + 2];
      const t = template[i++];
      sumI += g;
      sumI2 += g * g;
      sumIT += g * t;
      row += 4;
    }
  }
  const meanI = sumI / n;
  const varI = Math.max(1e-3, sumI2 / n - meanI * meanI);
  let meanT = 0;
  let varT = 0;
  for (let k = 0; k < n; k++) {
    meanT += template[k];
    varT += template[k] * template[k];
  }
  meanT /= n;
  varT = Math.max(1e-3, varT / n - meanT * meanT);
  const cov = sumIT / n - meanI * meanT;
  return cov / Math.sqrt(varI * varT);
}

function extractGrayPatch(
  frame: ImageData,
  cx: number,
  cy: number,
  w: number,
  h: number,
): { gray: Float32Array; w: number; h: number } {
  const x0 = clamp(Math.round(cx - w / 2), 0, Math.max(0, frame.width - w));
  const y0 = clamp(Math.round(cy - h / 2), 0, Math.max(0, frame.height - h));
  const ww = Math.min(w, frame.width - x0);
  const hh = Math.min(h, frame.height - y0);
  const gray = new Float32Array(ww * hh);
  const data = frame.data;
  let i = 0;
  for (let y = 0; y < hh; y++) {
    let row = ((y0 + y) * frame.width + x0) * 4;
    for (let x = 0; x < ww; x++) {
      gray[i++] = 0.299 * data[row] + 0.587 * data[row + 1] + 0.114 * data[row + 2];
      row += 4;
    }
  }
  return { gray, w: ww, h: hh };
}

function extractHist(frame: ImageData, cx: number, cy: number, w: number, h: number): Hist {
  const hist = new Float32Array(HIST_LEN);
  const x0 = clamp(Math.round(cx - w / 2), 0, frame.width - 1);
  const y0 = clamp(Math.round(cy - h / 2), 0, frame.height - 1);
  const x1 = clamp(x0 + w, 0, frame.width);
  const y1 = clamp(y0 + h, 0, frame.height);
  const data = frame.data;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    let row = (y * frame.width + x0) * 4;
    for (let x = x0; x < x1; x++) {
      accumHist(hist, data[row], data[row + 1], data[row + 2]);
      n++;
      row += 4;
    }
  }
  normalize(hist, n);
  return hist;
}

function histFromColor(r: number, g: number, b: number, sampled: Hist): Hist {
  const peaked = new Float32Array(HIST_LEN);
  accumHist(peaked, r, g, b);
  normalize(peaked, 1);
  const out = new Float32Array(HIST_LEN);
  for (let i = 0; i < HIST_LEN; i++) out[i] = peaked[i] * 0.7 + sampled[i] * 0.3;
  normalize(out, 1);
  return out;
}

function accumHist(hist: Hist, r: number, g: number, b: number): void {
  const hsv = rgbToHsv(r, g, b);
  const hi = Math.min(H_BINS - 1, Math.floor((hsv.h / 360) * H_BINS));
  const si = Math.min(S_BINS - 1, Math.floor(hsv.s * S_BINS));
  const vi = Math.min(V_BINS - 1, Math.floor(hsv.v * V_BINS));
  hist[hi] += 1;
  hist[H_BINS + si] += 1;
  hist[H_BINS + S_BINS + vi] += 1;
}

function histIntersect(a: Hist, b: Hist): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.min(a[i], b[i]);
  return s;
}

function circularity(
  frame: ImageData,
  x: number,
  y: number,
  tw: number,
  th: number,
  hist: Hist,
  allowEllipse: boolean,
): number {
  const data = frame.data;
  let match = 0;
  let total = 0;
  const cx = tw / 2;
  const cy = th / 2;
  const rx = Math.max(1, tw / 2);
  const ry = Math.max(1, th / 2);
  const step = tw > 24 ? 2 : 1;
  for (let yy = 0; yy < th; yy += step) {
    let row = ((y + yy) * frame.width + x) * 4;
    for (let xx = 0; xx < tw; xx += step) {
      const nx = (xx - cx) / rx;
      const ny = (yy - cy) / ry;
      if (nx * nx + ny * ny <= 1) {
        const hsv = rgbToHsv(data[row], data[row + 1], data[row + 2]);
        const hi = Math.min(H_BINS - 1, Math.floor((hsv.h / 360) * H_BINS));
        const si = Math.min(S_BINS - 1, Math.floor(hsv.s * S_BINS));
        const vi = Math.min(V_BINS - 1, Math.floor(hsv.v * V_BINS));
        if (hist[hi] + hist[H_BINS + si] + hist[H_BINS + S_BINS + vi] > 0.12) match++;
        total++;
      }
      row += 4 * step;
    }
  }
  if (total === 0) return 0;
  const fill = match / total;
  if (allowEllipse) return Math.min(1, fill / 0.35);
  return Math.min(1, fill / 0.45);
}

function blendTemplate(dst: Float32Array, src: Float32Array, a: number): void {
  const n = Math.min(dst.length, src.length);
  for (let i = 0; i < n; i++) dst[i] = dst[i] * (1 - a) + src[i] * a;
}

function blendHist(dst: Hist, src: Hist, a: number): void {
  for (let i = 0; i < dst.length; i++) dst[i] = dst[i] * (1 - a) + src[i] * a;
  normalize(dst, 1);
}

function normalize(h: Float32Array, n: number): void {
  const s = n > 0 ? n : 1;
  let sum = 0;
  for (let i = 0; i < h.length; i++) sum += h[i];
  const d = sum > 0 ? sum : s;
  for (let i = 0; i < h.length; i++) h[i] /= d;
}

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

function clampRoi(x: number, y: number, w: number, h: number, fw: number, fh: number) {
  const x0 = clamp(x, 0, fw - 1);
  const y0 = clamp(y, 0, fh - 1);
  const w0 = Math.max(2, Math.min(w, fw - x0));
  const h0 = Math.max(2, Math.min(h, fh - y0));
  return { x: x0, y: y0, w: w0, h: h0 };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function mahalanobis(dx: number, dy: number, varP: number): number {
  return Math.hypot(dx, dy) / Math.sqrt(Math.max(4, varP));
}

function ident4(v: number): number[][] {
  return [
    [v, 0, 0, 0],
    [0, v, 0, 0],
    [0, 0, v, 0],
    [0, 0, 0, v],
  ];
}

function trans4(A: number[][]): number[][] {
  const T = ident4(0);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) T[j][i] = A[i][j];
  return T;
}

function mul4(A: number[][], B: number[][]): number[][] {
  const C = ident4(0);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      C[i][j] = A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j] + A[i][3] * B[3][j];
    }
  }
  return C;
}

function add4(A: number[][], B: number[][]): number[][] {
  const C = ident4(0);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) C[i][j] = A[i][j] + B[i][j];
  return C;
}

function processQ(dt: number, q: number): number[][] {
  const dt2 = dt * dt;
  const dt3 = dt2 * dt;
  const dt4 = dt2 * dt2;
  const a = q * dt4 / 4;
  const b = q * dt3 / 2;
  const c = q * dt2;
  return [
    [a, 0, b, 0],
    [0, a, 0, b],
    [b, 0, c, 0],
    [0, b, 0, c],
  ];
}

export function hexToRgb(hex: string): [number, number, number] | undefined {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return undefined;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

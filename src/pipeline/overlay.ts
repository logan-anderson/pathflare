import type { TrailSegment } from "../lib/types";

export type TrailOpts = {
  alpha?: number;
  widthScale?: number;
  bloom?: boolean;
};

export function drawOverlay(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  width: number,
  height: number,
  source: CanvasImageSource,
  segments: TrailSegment[],
  color: string,
): void {
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  for (const pts of segments) {
    paintTrail(ctx, pts, color);
  }
}

export function paintTrail(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  pts: { x: number; y: number }[],
  color: string,
  opts: TrailOpts = {},
): void {
  if (pts.length === 0) return;
  const alpha = opts.alpha ?? 1;
  const widthScale = opts.widthScale ?? 1;
  const doBloom = opts.bloom ?? true;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (pts.length === 1) {
    if (doBloom) bloom(ctx, pts[0].x, pts[0].y, color, alpha);
    ctx.restore();
    return;
  }
  strokeFade(ctx, pts, color, 16 * widthScale, 0.22 * alpha);
  strokeFade(ctx, pts, color, 8 * widthScale, 0.4 * alpha);
  strokeFade(ctx, pts, "#f4fffb", 2.4 * widthScale, 0.75 * alpha);
  if (doBloom) {
    const head = pts[pts.length - 1];
    bloom(ctx, head.x, head.y, color, alpha);
  }
  ctx.restore();
}

function strokeFade(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  pts: { x: number; y: number }[],
  color: string,
  width: number,
  alphaScale: number,
): void {
  const n = pts.length;
  for (let i = 1; i < n; i++) {
    const a = (i / (n - 1)) ** 1.35 * alphaScale;
    ctx.beginPath();
    ctx.strokeStyle = withAlpha(color, a);
    ctx.shadowColor = withAlpha(color, a * 0.9);
    ctx.shadowBlur = width * 1.4;
    ctx.lineWidth = width;
    ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
    ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }
}

function bloom(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  scale: number,
): void {
  ctx.beginPath();
  ctx.fillStyle = withAlpha(color, 0.55 * scale);
  ctx.shadowColor = color;
  ctx.shadowBlur = 18 * scale;
  ctx.arc(x, y, 5.5 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.fillStyle = withAlpha("#ffffff", 0.85 * scale);
  ctx.shadowBlur = 6;
  ctx.arc(x, y, 2.1 * scale, 0, Math.PI * 2);
  ctx.fill();
}

function withAlpha(color: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  if (color.startsWith("#") && (color.length === 7 || color.length === 4)) {
    const hex = color.length === 4
      ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
      : color;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
  return color;
}

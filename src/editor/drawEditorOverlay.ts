import { paintTrail } from "../pipeline/overlay";
import { samplePath, sortKeypoints, type Keypoint } from "../lib/keypoints";

export const HANDLE_SCREEN_PX = 14;
export const HANDLE_HIT_SCREEN_PX = 44;

export function drawEditorOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  keypoints: Keypoint[],
  frame: number,
  glow: string,
  selectedId: string | null,
  videoPxPerScreenPx: number,
  showTrail = true,
): void {
  ctx.clearRect(0, 0, width, height);
  const path = samplePath(keypoints, width, height);
  if (showTrail && path.length > 0) {
    paintTrail(ctx, path, glow, { alpha: 0.3, widthScale: 0.62, bloom: false });
    const first = path[0].frame;
    const last = path[path.length - 1].frame;
    if (frame >= first) {
      const thick = path.filter((p) => p.frame <= Math.min(frame, last));
      paintTrail(ctx, thick, glow, { bloom: true });
    }
  }

  const scale = Math.max(videoPxPerScreenPx, 1e-6);
  const r = (HANDLE_SCREEN_PX / 2) / scale;
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  for (const kp of sortKeypoints(keypoints)) {
    const x = kp.x * width;
    const y = kp.y * height;
    const selected = kp.id === selectedId;
    ctx.beginPath();
    ctx.fillStyle = selected ? "#fff7c2" : "#f4f7fb";
    ctx.strokeStyle = selected ? glow : "rgba(12, 17, 24, 0.85)";
    ctx.lineWidth = Math.max(1.5, 2 / scale);
    ctx.shadowColor = glow;
    ctx.shadowBlur = selected ? 12 / scale : 0;
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

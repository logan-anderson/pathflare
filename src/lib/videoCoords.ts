/**
 * object-fit: contain mapping. Portrait 720×1280 in a landscape stage letterboxes
 * on the sides; clicks in the bars must not become video coordinates.
 */

export type ContainMapping = {
  offsetX: number;
  offsetY: number;
  drawWidth: number;
  drawHeight: number;
  scale: number;
  containerWidth: number;
  containerHeight: number;
  videoWidth: number;
  videoHeight: number;
};

export function containMapping(
  containerWidth: number,
  containerHeight: number,
  videoWidth: number,
  videoHeight: number,
): ContainMapping {
  const cw = Math.max(0, containerWidth);
  const ch = Math.max(0, containerHeight);
  const vw = Math.max(1, videoWidth);
  const vh = Math.max(1, videoHeight);
  const scale = Math.min(cw / vw, ch / vh);
  const drawWidth = vw * scale;
  const drawHeight = vh * scale;
  return {
    offsetX: (cw - drawWidth) / 2,
    offsetY: (ch - drawHeight) / 2,
    drawWidth,
    drawHeight,
    scale,
    containerWidth: cw,
    containerHeight: ch,
    videoWidth: vw,
    videoHeight: vh,
  };
}

export type RectLike = { left: number; top: number; width: number; height: number };

/** Map a pointer in the stage container to normalized video pixels, or null in the letterbox. */
export function clientToNormalized(
  clientX: number,
  clientY: number,
  container: RectLike,
  videoWidth: number,
  videoHeight: number,
): { x: number; y: number } | null {
  const localX = clientX - container.left;
  const localY = clientY - container.top;
  const m = containMapping(container.width, container.height, videoWidth, videoHeight);
  if (m.drawWidth <= 1e-6 || m.drawHeight <= 1e-6) return null;
  const x = (localX - m.offsetX) / m.drawWidth;
  const y = (localY - m.offsetY) / m.drawHeight;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
}

export function screenPxToVideoPx(screenPx: number, mapping: ContainMapping): number {
  return mapping.scale > 1e-6 ? screenPx / mapping.scale : screenPx;
}

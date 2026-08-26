/** Clockwise display rotation. iPhone -90 (CCW) is 270. */
export type RotationDeg = 0 | 90 | 180 | 270;

export function normalizeRotation(deg: number): RotationDeg {
  const n = ((Math.round(deg) % 360) + 360) % 360;
  if (n >= 315 || n < 45) return 0;
  if (n < 135) return 90;
  if (n < 225) return 180;
  return 270;
}

/**
 * Draw the current HTMLVideoElement frame into a display-oriented canvas.
 * If the browser already applied rotation metadata, drawImage is a straight copy.
 * Otherwise apply clockwise rotation so portrait iPhone clips (coded landscape, rot -90) display upright.
 */
export function drawVideoToDisplay(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  video: HTMLVideoElement,
  displayWidth: number,
  displayHeight: number,
  rotation: number,
): void {
  const dw = Math.max(1, displayWidth);
  const dh = Math.max(1, displayHeight);
  ctx.clearRect(0, 0, dw, dh);
  const vw = video.videoWidth || dw;
  const vh = video.videoHeight || dh;
  const videoPortrait = vh >= vw;
  const displayPortrait = dh >= dw;
  const alreadyOriented = videoPortrait === displayPortrait;
  if (alreadyOriented || normalizeRotation(rotation) === 0) {
    ctx.drawImage(video, 0, 0, dw, dh);
    return;
  }
  const rot = normalizeRotation(rotation);
  ctx.save();
  if (rot === 90) {
    ctx.translate(dw, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(video, 0, 0, dh, dw);
  } else if (rot === 270) {
    ctx.translate(0, dh);
    ctx.rotate(-Math.PI / 2);
    ctx.drawImage(video, 0, 0, dh, dw);
  } else {
    ctx.translate(dw, dh);
    ctx.rotate(Math.PI);
    ctx.drawImage(video, 0, 0, dw, dh);
  }
  ctx.restore();
}

export function seekVideo(video: HTMLVideoElement, timeSec: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = Math.max(0, timeSec);
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Seek failed"));
    };
    const cleanup = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    if (Math.abs(video.currentTime - t) < 0.001 && video.readyState >= 2) {
      cleanup();
      resolve();
      return;
    }
    video.currentTime = t;
  });
}

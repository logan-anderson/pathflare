import { clipDurationSec, fitProcessSize, frameCountFor, is1080Size, is4kSize, PHONE_WARN_SEC, TARGET_FPS, WARN_CLIP_SEC } from "../lib/clipBudget";
import { isPhone } from "../lib/featureDetect";
import { samplePath } from "../lib/keypoints";
import { drawVideoToDisplay, seekVideo } from "../lib/rotation";
import type { Keypoint, ProbeInfo } from "../lib/types";
import { pickRecorderMime } from "./encode";
import { segmentsForFrame } from "./exportClip";
import { drawOverlay } from "./overlay";

export type FallbackExportOpts = {
  keypoints: Keypoint[];
  glow: string;
  width: number;
  height: number;
  frameCount: number;
  fps: number;
  rotation: number;
  cancelled: () => boolean;
  onProgress: (frame: number, total: number, etaMs: number) => void;
};

export async function probeWithVideoElement(file: Blob): Promise<ProbeInfo> {
  const { video, url } = await loadVideo(file);
  try {
    const durationSec = Number.isFinite(video.duration) ? video.duration : 0;
    const displayWidth = video.videoWidth || 1280;
    const displayHeight = video.videoHeight || 720;
    const process = fitProcessSize(displayWidth, displayHeight);
    const fourK = is4kSize(displayWidth, displayHeight);
    return {
      durationSec,
      codedWidth: displayWidth,
      codedHeight: displayHeight,
      displayWidth,
      displayHeight,
      processWidth: process.width,
      processHeight: process.height,
      codec: null,
      codecString: null,
      canDecode: displayWidth > 0,
      isHevc: false,
      is4k: fourK,
      is1080: is1080Size(displayWidth, displayHeight),
      overDuration: durationSec > WARN_CLIP_SEC + 0.15,
      overPhoneBudget: isPhone() && (durationSec > PHONE_WARN_SEC || fourK),
      rotation: 0,
      hasAudio: true,
      frameCount: frameCountFor(durationSec),
    };
  } finally {
    cleanupVideo(video, url);
  }
}

export async function exportWithVideoElement(
  file: Blob,
  opts: FallbackExportOpts,
): Promise<{ buffer: ArrayBuffer; mime: string; hasAudio: boolean }> {
  const { video, url } = await loadVideo(file);
  const mimePick = pickRecorderMime();
  const duration = clipDurationSec(Number.isFinite(video.duration) ? video.duration : 0);
  const fps = opts.fps > 0 ? opts.fps : TARGET_FPS;
  const total = Math.max(1, opts.frameCount || Math.round(duration * fps) || frameCountFor(duration, fps));
  const w = opts.width;
  const h = opts.height;

  const work = document.createElement("canvas");
  const out = document.createElement("canvas");
  work.width = out.width = w;
  work.height = out.height = h;
  const workCtx = work.getContext("2d", { alpha: false });
  const outCtx = out.getContext("2d", { alpha: false });
  if (!workCtx || !outCtx) throw new Error("Canvas 2D is unavailable.");

  const path = samplePath(opts.keypoints, w, h);
  const stream = out.captureStream(fps);
  let hasAudio = false;
  try {
    const media = video as HTMLVideoElement & { captureStream?: () => MediaStream };
    if (media.captureStream) {
      const captured = media.captureStream();
      for (const track of captured.getAudioTracks()) {
        stream.addTrack(track);
        hasAudio = true;
      }
    }
  } catch {
    hasAudio = false;
  }

  const recorder = new MediaRecorder(stream, mimePick.mime ? { mimeType: mimePick.mime } : undefined);
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (ev) => {
    if (ev.data.size) chunks.push(ev.data);
  };
  const stopped = new Promise<void>((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = () => reject(new Error("Recording failed"));
  });
  recorder.start(200);

  const started = performance.now();
  video.muted = !hasAudio;

  try {
    for (let i = 0; i < total; i++) {
      if (opts.cancelled()) throw new Error("Canceled");
      const t = Math.min(duration, i / fps);
      await seekVideo(video, t);
      drawVideoToDisplay(workCtx, video, w, h, opts.rotation);
      drawOverlay(outCtx, w, h, work, segmentsForFrame(path, i), opts.glow);
      const outTrack = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined;
      outTrack?.requestFrame?.();
      const elapsed = performance.now() - started;
      const rate = (i + 1) / Math.max(1, elapsed);
      opts.onProgress(i + 1, total, (total - i - 1) / Math.max(rate, 1e-6));
    }
  } finally {
    if (recorder.state !== "inactive") recorder.stop();
    await stopped;
    cleanupVideo(video, url);
  }

  const blob = new Blob(chunks, { type: mimePick.mime || "video/webm" });
  return { buffer: await blob.arrayBuffer(), mime: blob.type || mimePick.mime, hasAudio };
}

export async function loadVideo(file: Blob): Promise<{ video: HTMLVideoElement; url: string }> {
  const video = document.createElement("video");
  video.playsInline = true;
  video.muted = true;
  video.preload = "auto";
  const url = URL.createObjectURL(file);
  video.src = url;
  await new Promise<void>((resolve, reject) => {
    const onReady = () => resolve();
    video.onloadeddata = onReady;
    video.onerror = () => reject(new Error("This browser could not decode the video."));
  });
  return { video, url };
}

export function cleanupVideo(video: HTMLVideoElement, url: string): void {
  video.pause();
  video.removeAttribute("src");
  video.load();
  URL.revokeObjectURL(url);
}

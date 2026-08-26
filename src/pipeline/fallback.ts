import { fitProcessSize, is4kSize, MAX_CLIP_SEC, PHONE_WARN_SEC, TARGET_FPS } from "../lib/clipBudget";
import { isPhone } from "../lib/featureDetect";
import { glowFor, presetById } from "../lib/presets";
import type { ProbeInfo, SportId } from "../lib/types";
import { pickRecorderMime } from "./encode";
import { assertNot4kImageData } from "./demux";
import { drawOverlay } from "./overlay";
import type { ProcessHooks } from "./processClip";
import { hexToRgb, ObjectTracker } from "./tracker";

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
      overDuration: durationSec > MAX_CLIP_SEC + 0.15,
      overPhoneBudget: isPhone() && (durationSec > PHONE_WARN_SEC || fourK),
      rotation: 0,
      hasAudio: true,
      frameCount: Math.max(1, Math.round(Math.min(durationSec || MAX_CLIP_SEC, MAX_CLIP_SEC) * TARGET_FPS)),
    };
  } finally {
    cleanupVideo(video, url);
  }
}

export async function firstFrameWithVideoElement(file: Blob): Promise<{
  bitmap: ImageBitmap;
  width: number;
  height: number;
  probe: ProbeInfo;
}> {
  const probe = await probeWithVideoElement(file);
  const { video, url } = await loadVideo(file);
  try {
    await seek(video, 0);
    const canvas = document.createElement("canvas");
    canvas.width = probe.processWidth;
    canvas.height = probe.processHeight;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas 2D is unavailable.");
    ctx.drawImage(video, 0, 0, probe.processWidth, probe.processHeight);
    const bitmap = await createImageBitmap(canvas);
    return { bitmap, width: probe.processWidth, height: probe.processHeight, probe };
  } finally {
    cleanupVideo(video, url);
  }
}

export async function processWithVideoElement(
  file: Blob,
  opts: {
    sport: SportId;
    customColor: string;
    seed: { x: number; y: number };
  } & ProcessHooks,
): Promise<{ buffer: ArrayBuffer; mime: string; hasAudio: boolean }> {
  const { video, url } = await loadVideo(file);
  const mimePick = pickRecorderMime();
  const duration = Math.min(Number.isFinite(video.duration) ? video.duration : MAX_CLIP_SEC, MAX_CLIP_SEC);
  const total = Math.max(1, Math.round(duration * TARGET_FPS));
  const w = fitProcessSize(video.videoWidth || 1280, video.videoHeight || 720).width;
  const h = fitProcessSize(video.videoWidth || 1280, video.videoHeight || 720).height;
  assertNot4kImageData(w, h);

  const work = document.createElement("canvas");
  const out = document.createElement("canvas");
  work.width = out.width = w;
  work.height = out.height = h;
  const workCtx = work.getContext("2d", { alpha: false, willReadFrequently: true });
  const outCtx = out.getContext("2d", { alpha: false });
  if (!workCtx || !outCtx) throw new Error("Canvas 2D is unavailable.");

  const preset = presetById(opts.sport);
  const glow = glowFor(opts.sport, opts.customColor);
  const tracker = new ObjectTracker(preset);
  const customRgb = opts.sport === "custom" ? hexToRgb(opts.customColor) : undefined;

  const stream = out.captureStream(TARGET_FPS);
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
  let seeded = false;
  video.muted = !hasAudio;
  video.playbackRate = 1;

  try {
    for (let i = 0; i < total; i++) {
      if (opts.cancelled()) throw new Error("Canceled");
      const t = Math.min(duration, i / TARGET_FPS);
      await seek(video, t);
      workCtx.drawImage(video, 0, 0, w, h);
      const pixels = workCtx.getImageData(0, 0, w, h);
      if (!seeded) {
        tracker.seed(pixels, opts.seed.x, opts.seed.y, customRgb);
        seeded = true;
      } else {
        const result = tracker.step(pixels, t);
        if (result.lost) {
          const bitmap = await createImageBitmap(work);
          const next = await opts.onNeedRetap(bitmap, w, h, i + 1, total);
          if (!next) throw new Error("Canceled");
          const pixels2 = workCtx.getImageData(0, 0, w, h);
          tracker.seed(pixels2, next.x, next.y, customRgb);
        }
      }
      drawOverlay(outCtx, w, h, work, tracker.segments, glow);
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

async function loadVideo(file: Blob): Promise<{ video: HTMLVideoElement; url: string }> {
  const video = document.createElement("video");
  video.playsInline = true;
  video.muted = true;
  video.preload = "auto";
  const url = URL.createObjectURL(file);
  video.src = url;
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error("This browser could not decode the video."));
  });
  return { video, url };
}

function cleanupVideo(video: HTMLVideoElement, url: string): void {
  video.pause();
  video.removeAttribute("src");
  video.load();
  URL.revokeObjectURL(url);
}

function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      resolve();
    };
    const onError = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      reject(new Error("Seek failed"));
    };
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    if (Math.abs(video.currentTime - t) < 0.001) {
      onSeeked();
      return;
    }
    video.currentTime = t;
  });
}

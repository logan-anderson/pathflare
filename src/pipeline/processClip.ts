import { VideoSampleSink } from "mediabunny";
import { MAX_CLIP_SEC, TARGET_FPS } from "../lib/clipBudget";
import { HEVC_HELP } from "../lib/featureDetect";
import { glowFor, presetById } from "../lib/presets";
import type { SportId } from "../lib/types";
import { createMp4Encoder } from "./encode";
import { disposeInput, openInput, probeInput, videoDuration, assertNot4kImageData } from "./demux";
import { drawOverlay } from "./overlay";
import { hexToRgb, ObjectTracker } from "./tracker";

export type ProcessHooks = {
  cancelled: () => boolean;
  onProgress: (frame: number, total: number, etaMs: number) => void;
  onNeedRetap: (bitmap: ImageBitmap, width: number, height: number, frame: number, total: number) => Promise<{ x: number; y: number } | null>;
};

export async function processClip(
  file: Blob,
  opts: {
    sport: SportId;
    customColor: string;
    seed: { x: number; y: number };
  } & ProcessHooks,
): Promise<{ buffer: ArrayBuffer; mime: string; hasAudio: boolean }> {
  const input = await openInput(file);
  let encoder: Awaited<ReturnType<typeof createMp4Encoder>> | null = null;
  try {
    const probe = await probeInput(input);
    if (!probe.canDecode) {
      throw new Error(probe.isHevc ? HEVC_HELP : `This browser cannot decode ${probe.codec ?? "this"} video.`);
    }
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) throw new Error("No video track found in this file.");
    const audioTrack = await input.getPrimaryAudioTrack();
    const w = probe.processWidth;
    const h = probe.processHeight;
    const duration = Math.min(await videoDuration(videoTrack), MAX_CLIP_SEC);
    const total = Math.max(1, Math.round(duration * TARGET_FPS));

    encoder = await createMp4Encoder({
      width: w,
      height: h,
      audioTrack,
    });

    const work = new OffscreenCanvas(w, h);
    const out = new OffscreenCanvas(w, h);
    const workCtx = work.getContext("2d", { alpha: false, willReadFrequently: true });
    const outCtx = out.getContext("2d", { alpha: false });
    if (!workCtx || !outCtx) throw new Error("OffscreenCanvas 2D is unavailable.");

    const preset = presetById(opts.sport);
    const glow = glowFor(opts.sport, opts.customColor);
    const tracker = new ObjectTracker(preset);
    const customRgb = opts.sport === "custom" ? hexToRgb(opts.customColor) : undefined;

    const sink = new VideoSampleSink(videoTrack);
    const timestamps: number[] = [];
    for (let i = 0; i < total; i++) timestamps.push(i / TARGET_FPS);

    const started = performance.now();
    let seeded = false;
    let i = 0;

    opts.onProgress(0, total, 0);

    for await (const sample of sink.samplesAtTimestamps(timestamps)) {
      if (opts.cancelled()) {
        await encoder.cancel();
        throw new Error("Canceled");
      }
      if (!sample) {
        i += 1;
        continue;
      }
      try {
        workCtx.clearRect(0, 0, w, h);
        sample.draw(workCtx, 0, 0, w, h);
        assertNot4kImageData(w, h);
        const pixels = workCtx.getImageData(0, 0, w, h);

        if (!seeded) {
          tracker.seed(pixels, opts.seed.x, opts.seed.y, customRgb);
          seeded = true;
        } else {
          const result = tracker.step(pixels, sample.timestamp);
          if (result.lost) {
            const bitmap = await createImageBitmap(work);
            const next = await opts.onNeedRetap(bitmap, w, h, i + 1, total);
            if (!next) {
              await encoder.cancel();
              throw new Error("Canceled");
            }
            const pixels2 = workCtx.getImageData(0, 0, w, h);
            tracker.seed(pixels2, next.x, next.y, customRgb);
          }
        }

        drawOverlay(outCtx, w, h, work, tracker.segments, glow);
        const ts = Number.isFinite(sample.timestamp) ? Math.max(0, sample.timestamp) : i / TARGET_FPS;
        const dur = sample.duration > 0 ? sample.duration : 1 / TARGET_FPS;
        opts.onProgress(i + 1, total, estimateEta(started, i, total));
        await encoder.addFrame(out, ts, dur);
      } finally {
        sample.close();
      }
      i += 1;
      await Promise.resolve();
    }

    const blob = await encoder.finalize();
    const buffer = await blob.arrayBuffer();
    return { buffer, mime: blob.type || "video/mp4", hasAudio: Boolean(audioTrack) };
  } catch (err) {
    if (encoder) await encoder.cancel().catch(() => undefined);
    throw err;
  } finally {
    disposeInput(input);
  }
}

function estimateEta(started: number, index: number, total: number): number {
  const elapsed = performance.now() - started;
  const rate = (index + 1) / Math.max(1, elapsed);
  return (total - index - 1) / Math.max(rate, 1e-6);
}

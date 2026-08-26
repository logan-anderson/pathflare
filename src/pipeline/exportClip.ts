import { VideoSampleSink } from "mediabunny";
import { clipDurationSec, TARGET_FPS } from "../lib/clipBudget";
import { HEVC_HELP } from "../lib/featureDetect";
import { samplePath, trailUpTo, type SampledPoint } from "../lib/keypoints";
import { DECODE_TIMEOUT, DECODE_TIMEOUT_MS, decodeFailureMessage, withTimeout } from "../lib/timeout";
import type { Keypoint } from "../lib/types";
import { createMp4Encoder } from "./encode";
import { disposeInput, openInput, probeInput, videoDuration } from "./demux";
import { drawOverlay } from "./overlay";

export type ExportHooks = {
  cancelled: () => boolean;
  onProgress: (frame: number, total: number, etaMs: number) => void;
};

export type ExportOpts = {
  keypoints: Keypoint[];
  glow: string;
  width?: number;
  height?: number;
  frameCount?: number;
  fps?: number;
} & ExportHooks;

export async function exportClip(
  file: Blob,
  opts: ExportOpts,
): Promise<{ buffer: ArrayBuffer; mime: string; hasAudio: boolean }> {
  const input = await openInput(file);
  let encoder: Awaited<ReturnType<typeof createMp4Encoder>> | null = null;
  try {
    const probe = await probeInput(input);
    if (!probe.canDecode) {
      throw new Error(decodeFailureMessage(probe.isHevc, probe.codec));
    }
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) throw new Error("No video track found in this file.");
    const audioTrack = await input.getPrimaryAudioTrack();
    const w = opts.width ?? probe.processWidth;
    const h = opts.height ?? probe.processHeight;
    const fps = opts.fps && opts.fps > 0 ? opts.fps : TARGET_FPS;
    const duration = clipDurationSec(await videoDuration(videoTrack));
    const total = Math.max(1, opts.frameCount ?? Math.round(duration * fps));
    opts.onProgress(0, total, 0);

    encoder = await createMp4Encoder({
      width: w,
      height: h,
      audioTrack,
    });
    opts.onProgress(0, total, 0);

    const work = new OffscreenCanvas(w, h);
    const out = new OffscreenCanvas(w, h);
    const workCtx = work.getContext("2d", { alpha: false });
    const outCtx = out.getContext("2d", { alpha: false });
    if (!workCtx || !outCtx) throw new Error("OffscreenCanvas 2D is unavailable.");

    const path = samplePath(opts.keypoints, w, h);
    const sink = new VideoSampleSink(videoTrack);
    const timestamps: number[] = [];
    for (let i = 0; i < total; i++) timestamps.push(i / fps);

    const started = performance.now();
    let i = 0;

    const samples = sink.samplesAtTimestamps(timestamps)[Symbol.asyncIterator]();
    for (;;) {
      const step = await withTimeout(samples.next(), DECODE_TIMEOUT_MS, DECODE_TIMEOUT);
      if (step.done) break;
      const sample = step.value;
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
        await withTimeout(
          Promise.resolve(sample.draw(workCtx, 0, 0, w, h)),
          DECODE_TIMEOUT_MS,
          DECODE_TIMEOUT,
        );
        drawOverlay(outCtx, w, h, work, segmentsForFrame(path, i), opts.glow);
        const ts = i / fps;
        const dur = 1 / fps;
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
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes(DECODE_TIMEOUT)) {
      throw new Error(HEVC_HELP);
    }
    throw err;
  } finally {
    disposeInput(input);
  }
}

export function segmentsForFrame(path: SampledPoint[], frame: number) {
  const pts = trailUpTo(path, frame);
  if (pts.length === 0) return [];
  return [pts.map((p) => ({ x: p.x, y: p.y, t: p.frame }))];
}

function estimateEta(started: number, index: number, total: number): number {
  const elapsed = performance.now() - started;
  const rate = (index + 1) / Math.max(1, elapsed);
  return (total - index - 1) / Math.max(rate, 1e-6);
}

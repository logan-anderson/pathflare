import { HEVC_HELP } from "./featureDetect";

export const DECODE_TIMEOUT = "DECODE_TIMEOUT";
export const DECODE_TIMEOUT_MS = 8_000;
export const PROBE_TIMEOUT_MS = 12_000;
export const EXPORT_STALL = "EXPORT_STALL";
/** No new frame for this long (encoder start + audio copy + a slow first frame). */
export const EXPORT_STALL_MS = 60_000;

/**
 * Worst-case wall time we are willing to let a bake run *if it is still
 * advancing*. 448 frames at ~0.5–1.6s/frame needs 8–12+ minutes, not 3.
 * The watchdog must not use a flat 180s cap on a progressing job.
 */
export function exportBudgetMs(frameCount: number): number {
  const frames = Math.max(1, Math.floor(frameCount) || 1);
  const perFrame = 1_600;
  const floor = 12 * 60_000;
  const setup = 2 * 60_000;
  return Math.max(floor, frames * perFrame) + setup;
}

export const EMPTY_EXPORT = "EMPTY_EXPORT";
export const EMPTY_EXPORT_HELP =
  "Export produced an empty file. Your marks are still here. Try again.";

export const EXPORT_STALL_HELP =
  "Export stalled — the encoder stopped responding. Your marks are still here. Try again, use Safari, or re-export the clip as Most Compatible (H.264).";

export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export function isHevcCodec(codec: string | null | undefined, codecString: string | null | undefined): boolean {
  const blob = `${codec ?? ""} ${codecString ?? ""}`.toLowerCase();
  return (
    blob.includes("hevc") ||
    blob.includes("hvc1") ||
    blob.includes("hev1") ||
    blob.includes("dvh1") ||
    blob.includes("dvhe") ||
    blob.includes("dolby")
  );
}

export function decodeFailureMessage(isHevc: boolean, codec: string | null): string {
  if (isHevc) return HEVC_HELP;
  return `This browser cannot decode ${codec ?? "this"} video.`;
}

export function isDecodeTimeout(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes(DECODE_TIMEOUT) || /timed? ?out/i.test(message);
}

export function exportErrorMessage(err: unknown): string | null {
  const message = err instanceof Error ? err.message : String(err);
  if (message === "Canceled") return null;
  if (message.includes(EMPTY_EXPORT) || /empty file/i.test(message)) {
    return EMPTY_EXPORT_HELP;
  }
  if (
    message.includes(EXPORT_STALL) ||
    message.includes("ENCODER_UNSUPPORTED") ||
    message.toLowerCase().includes("timed out")
  ) {
    return EXPORT_STALL_HELP;
  }
  if (message.includes(DECODE_TIMEOUT) || message === HEVC_HELP) return HEVC_HELP;
  if (message.trim()) return `${message} Your marks are still here.`;
  return "Export failed. Your marks are still here. Try again, or use an H.264 clip in Safari.";
}

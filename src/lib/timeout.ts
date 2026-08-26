import { HEVC_HELP } from "./featureDetect";

export const DECODE_TIMEOUT = "DECODE_TIMEOUT";
export const DECODE_TIMEOUT_MS = 8_000;
export const PROBE_TIMEOUT_MS = 12_000;

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

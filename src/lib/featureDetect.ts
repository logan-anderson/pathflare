export type FeatureSupport = {
  webCodecs: boolean;
  videoDecoder: boolean;
  videoEncoder: boolean;
  audioDecoder: boolean;
  offscreenCanvas: boolean;
  worker: boolean;
  pipeline: "webcodecs" | "fallback";
};

export function detectFeatures(): FeatureSupport {
  const videoDecoder = typeof VideoDecoder !== "undefined";
  const videoEncoder = typeof VideoEncoder !== "undefined";
  const audioDecoder = typeof AudioDecoder !== "undefined";
  const offscreenCanvas = typeof OffscreenCanvas !== "undefined";
  const worker = typeof Worker !== "undefined";
  const webCodecs = videoDecoder && videoEncoder;
  const pipeline: FeatureSupport["pipeline"] =
    webCodecs && offscreenCanvas && worker ? "webcodecs" : "fallback";
  return {
    webCodecs,
    videoDecoder,
    videoEncoder,
    audioDecoder,
    offscreenCanvas,
    worker,
    pipeline,
  };
}

export function isPhone(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/Mobi|Android|iPhone|iPod/i.test(ua)) return true;
  if (/iPad/i.test(ua)) return true;
  const width =
    typeof globalThis !== "undefined" && "innerWidth" in globalThis
      ? Number((globalThis as { innerWidth?: number }).innerWidth ?? 1200)
      : 1200;
  return navigator.maxTouchPoints > 1 && width < 920;
}

export function isChromeWindows(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Windows/i.test(ua) && /Chrome\//i.test(ua) && !/Edg\//i.test(ua);
}

export const HEVC_HELP =
  "This clip looks like HEVC. Chrome on Windows often cannot decode it. Open it in Safari, or re-export as Most Compatible (H.264).";

export type FeatureSupport = {
  webCodecs: boolean;
  videoDecoder: boolean;
  videoEncoder: boolean;
  audioDecoder: boolean;
  offscreenCanvas: boolean;
  worker: boolean;
  pipeline: "webcodecs" | "fallback";
};

export type NavSnapshot = {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
  vendor?: string;
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

export function readNav(nav?: NavSnapshot): Required<Pick<NavSnapshot, "userAgent" | "platform" | "maxTouchPoints">> {
  if (nav) {
    return {
      userAgent: nav.userAgent ?? "",
      platform: nav.platform ?? "",
      maxTouchPoints: nav.maxTouchPoints ?? 0,
    };
  }
  if (typeof navigator === "undefined") {
    return { userAgent: "", platform: "", maxTouchPoints: 0 };
  }
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
  };
}

export function isPhone(nav?: NavSnapshot): boolean {
  const { userAgent, maxTouchPoints } = readNav(nav);
  if (/Mobi|Android|iPhone|iPod/i.test(userAgent)) return true;
  if (/iPad/i.test(userAgent)) return true;
  const width =
    typeof globalThis !== "undefined" && "innerWidth" in globalThis
      ? Number((globalThis as { innerWidth?: number }).innerWidth ?? 1200)
      : 1200;
  return maxTouchPoints > 1 && width < 920;
}

/** iPhone, iPod, iPad, and iPadOS (which reports as MacIntel + touch). */
export function isIOS(nav?: NavSnapshot): boolean {
  const { userAgent, platform, maxTouchPoints } = readNav(nav);
  if (/iPad|iPhone|iPod/i.test(userAgent) || /iPad|iPhone|iPod/i.test(platform)) return true;
  return platform === "MacIntel" && maxTouchPoints > 1;
}

/**
 * Safari and every iOS browser (Chrome/Firefox/Edge on iPhone are WebKit).
 * Desktop Chromium includes "Safari" in the UA but also "Chrome" — those are not WebKit.
 */
export function isWebKit(nav?: NavSnapshot): boolean {
  if (isIOS(nav)) return true;
  const { userAgent } = readNav(nav);
  if (!/AppleWebKit/i.test(userAgent)) return false;
  return !/Chrome\/|Chromium\/|Edg\/|OPR\/|Firefox\//i.test(userAgent);
}

/** Desktop Chrome / Edge / Opera / Chromium. Not iOS WebKit, not Android. */
export function isDesktopChromium(nav?: NavSnapshot): boolean {
  if (isIOS(nav) || isWebKit(nav)) return false;
  const { userAgent } = readNav(nav);
  if (/Mobi|Android/i.test(userAgent)) return false;
  return /Chrome\/|Chromium\/|Edg\/|OPR\//.test(userAgent);
}

/**
 * Programmatic `<a download>.click()` after an async bake is a user-gesture
 * no-op on iOS/WebKit and is ignored for blob: URLs. Only desktop Chromium
 * should auto-download.
 */
export function shouldAttemptAutoDownload(nav?: NavSnapshot): boolean {
  return isDesktopChromium(nav);
}

export function audioEncoderAvailable(): boolean {
  return typeof AudioEncoder !== "undefined";
}

export function isChromeWindows(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Windows/i.test(ua) && /Chrome\//i.test(ua) && !/Edg\//i.test(ua);
}

export const HEVC_HELP =
  "This clip is HEVC (typical iPhone recording, sometimes Dolby Vision). Chrome often cannot decode it and may appear to hang. Open Pathflare in Safari, or re-export the clip as Most Compatible (H.264) from Photos.";

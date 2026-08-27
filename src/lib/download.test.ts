import { describe, expect, it } from "vitest";
import { autoDownloadGraceMs, isShareAbort, toExportFile } from "./download";

const IPHONE = {
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0.6312.52 Mobile/15E148 Safari/604.1",
  platform: "iPhone",
  maxTouchPoints: 5,
};

const DESKTOP_CHROME = {
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  platform: "MacIntel",
  maxTouchPoints: 0,
};

describe("save overlay timing", () => {
  it("skips the auto-download grace on iOS so Tap to save is immediate", () => {
    expect(autoDownloadGraceMs(IPHONE)).toBe(0);
  });

  it("waits ~2s on desktop Chromium when auto-download cannot be confirmed", () => {
    expect(autoDownloadGraceMs(DESKTOP_CHROME)).toBe(2_000);
  });

  it("treats AbortError as a cancelled share sheet", () => {
    expect(isShareAbort(Object.assign(new Error("share"), { name: "AbortError" }))).toBe(true);
    expect(isShareAbort(new Error("fail"))).toBe(false);
  });

  it("wraps the baked blob as a named File for navigator.share", () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "video/mp4" });
    const file = toExportFile(blob, "pathflare-disc-clip.mp4");
    expect(file.name).toBe("pathflare-disc-clip.mp4");
    expect(file.type).toBe("video/mp4");
    expect(file.size).toBe(3);
  });
});

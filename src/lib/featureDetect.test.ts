import { describe, expect, it } from "vitest";
import { isDesktopChromium, isIOS, isWebKit, shouldAttemptAutoDownload } from "./featureDetect";

const IPHONE_CHROME = {
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0.6312.52 Mobile/15E148 Safari/604.1",
  platform: "iPhone",
  maxTouchPoints: 5,
};

const IPHONE_SAFARI = {
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  platform: "iPhone",
  maxTouchPoints: 5,
};

const IPADOS = {
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  platform: "MacIntel",
  maxTouchPoints: 5,
};

const DESKTOP_CHROME = {
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  platform: "Win32",
  maxTouchPoints: 0,
};

const DESKTOP_SAFARI = {
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  platform: "MacIntel",
  maxTouchPoints: 0,
};

const ANDROID_CHROME = {
  userAgent:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.6312.40 Mobile Safari/537.36",
  platform: "Linux armv8l",
  maxTouchPoints: 5,
};

describe("iOS / WebKit save-path detection", () => {
  it("treats iPhone Chrome as WebKit, not desktop Chromium", () => {
    expect(isIOS(IPHONE_CHROME)).toBe(true);
    expect(isWebKit(IPHONE_CHROME)).toBe(true);
    expect(isDesktopChromium(IPHONE_CHROME)).toBe(false);
    expect(shouldAttemptAutoDownload(IPHONE_CHROME)).toBe(false);
  });

  it("treats iPhone Safari and iPadOS as WebKit", () => {
    expect(isWebKit(IPHONE_SAFARI)).toBe(true);
    expect(isIOS(IPADOS)).toBe(true);
    expect(shouldAttemptAutoDownload(IPHONE_SAFARI)).toBe(false);
    expect(shouldAttemptAutoDownload(IPADOS)).toBe(false);
  });

  it("auto-downloads only on desktop Chromium", () => {
    expect(isDesktopChromium(DESKTOP_CHROME)).toBe(true);
    expect(shouldAttemptAutoDownload(DESKTOP_CHROME)).toBe(true);
    expect(isWebKit(DESKTOP_SAFARI)).toBe(true);
    expect(shouldAttemptAutoDownload(DESKTOP_SAFARI)).toBe(false);
    expect(shouldAttemptAutoDownload(ANDROID_CHROME)).toBe(false);
  });
});

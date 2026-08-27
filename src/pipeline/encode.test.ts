import { describe, expect, it } from "vitest";
import { avcEncodingConfig, mediaRecorderTimesliceMs, pickRecorderMime, TARGET_BITRATE } from "./encode";

const IPHONE = {
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  platform: "iPhone",
  maxTouchPoints: 5,
};

const DESKTOP_CHROME = {
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  platform: "Win32",
  maxTouchPoints: 0,
};

describe("avcEncodingConfig", () => {
  it("always sets an explicit bitrate at or below 8 Mbps and never quality-only", () => {
    const hardware = avcEncodingConfig({
      fullCodecString: "avc1.4d401f",
      hardwareAcceleration: "prefer-hardware",
    });
    const fallback = avcEncodingConfig({ hardwareAcceleration: "no-preference" });
    for (const config of [hardware, fallback]) {
      expect(config.bitrate).toBe(TARGET_BITRATE);
      expect(config.bitrate).toBeLessThanOrEqual(8_000_000);
      expect(config).not.toHaveProperty("quality");
    expect(config.codec).toBe("avc");
    }
    expect(avcEncodingConfig.toString()).not.toMatch(/\bquality\b/);
  });
});

describe("MediaRecorder mime and timeslice", () => {
  it("prefers video/mp4 on iOS and never webm", () => {
    const pick = pickRecorderMime(IPHONE);
    expect(pick.ext).toBe("mp4");
    expect(pick.mime).toContain("mp4");
    expect(pick.mime).not.toContain("webm");
  });

  it("does not timeslice export recording on iOS or desktop", () => {
    expect(mediaRecorderTimesliceMs("export", IPHONE)).toBeUndefined();
    expect(mediaRecorderTimesliceMs("export", DESKTOP_CHROME)).toBeUndefined();
  });

  it("does not timeslice live capture on iOS", () => {
    expect(mediaRecorderTimesliceMs("live", IPHONE)).toBeUndefined();
    expect(mediaRecorderTimesliceMs("live", DESKTOP_CHROME)).toBe(100);
  });
});

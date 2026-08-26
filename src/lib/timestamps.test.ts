import { describe, expect, it } from "vitest";
import { clampDuration, clampPacketTiming, clampTimestamp, isNegativeTimestampError } from "./timestamps";

describe("clampTimestamp", () => {
  it("forces frame 0 onto t=0 even when the source sample is slightly negative", () => {
    expect(clampTimestamp(-0.021333333333333333)).toBe(0);
    expect(clampTimestamp(-1024 / 48000)).toBe(0);
    expect(clampTimestamp(0)).toBe(0);
    expect(clampTimestamp(1 / 30)).toBeCloseTo(1 / 30);
  });

  it("treats non-finite values as 0", () => {
    expect(clampTimestamp(Number.NaN)).toBe(0);
    expect(clampTimestamp(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("clampPacketTiming", () => {
  it("skips AAC priming that ends at or before t=0 (1024 samples @ 48 kHz)", () => {
    expect(clampPacketTiming(-1024 / 48000, 1024 / 48000)).toBeNull();
    expect(clampPacketTiming(-0.021333333333333333, 0.021333333333333333)).toBeNull();
  });

  it("clips a packet that straddles t=0 so the muxer never sees a negative timestamp", () => {
    const clipped = clampPacketTiming(-0.021333333333333333, 0.04);
    expect(clipped).not.toBeNull();
    expect(clipped!.timestamp).toBe(0);
    expect(clipped!.duration).toBeCloseTo(0.04 - 0.021333333333333333);
  });

  it("leaves already-valid packets alone", () => {
    expect(clampPacketTiming(0, 1 / 30)).toEqual({ timestamp: 0, duration: 1 / 30 });
    expect(clampPacketTiming(1, 0.02)).toEqual({ timestamp: 1, duration: 0.02 });
  });
});

describe("clampDuration", () => {
  it("never returns a negative duration", () => {
    expect(clampDuration(-1, 1 / 30)).toBeCloseTo(1 / 30);
    expect(clampDuration(Number.NaN, 0)).toBe(0);
  });
});

describe("isNegativeTimestampError", () => {
  it("matches the mediabunny muxer message from production", () => {
    expect(
      isNegativeTimestampError(new Error("Timestamps must be non-negative (got -0.021333333333333333s).")),
    ).toBe(true);
    expect(isNegativeTimestampError(new Error("Canceled"))).toBe(false);
  });
});

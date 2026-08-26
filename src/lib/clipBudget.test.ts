import { describe, expect, it } from "vitest";
import { fitProcessSize, frameCountFor, is1080Size, shrinkOnlyEta } from "./clipBudget";

describe("clip budget", () => {
  it("processes portrait 1080×1920 at 720×1280", () => {
    expect(is1080Size(1080, 1920)).toBe(true);
    expect(fitProcessSize(1080, 1920)).toEqual({ width: 720, height: 1280 });
  });

  it("keeps a ~14.9s 30fps clip (~448 frames) under the 20s cap", () => {
    expect(frameCountFor(14.933)).toBe(448);
  });

  it("does not let export ETA grow when later estimates are noisier", () => {
    const after110 = shrinkOnlyEta(0, 0, 110, 173_000);
    expect(after110).toBe(173_000);
    const after191 = shrinkOnlyEta(110, after110, 191, 217_000);
    expect(after191).toBe(173_000);
    expect(shrinkOnlyEta(191, after191, 200, 120_000)).toBe(120_000);
  });
});

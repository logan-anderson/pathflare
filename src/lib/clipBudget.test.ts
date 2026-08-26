import { describe, expect, it } from "vitest";
import { fitProcessSize, frameCountFor, is1080Size } from "./clipBudget";

describe("clip budget", () => {
  it("processes portrait 1080×1920 at 720×1280", () => {
    expect(is1080Size(1080, 1920)).toBe(true);
    expect(fitProcessSize(1080, 1920)).toEqual({ width: 720, height: 1280 });
  });

  it("keeps a ~14.9s 30fps clip (~448 frames) under the 20s cap", () => {
    expect(frameCountFor(14.933)).toBe(448);
  });
});

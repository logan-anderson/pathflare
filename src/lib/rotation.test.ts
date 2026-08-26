import { describe, expect, it } from "vitest";
import { normalizeRotation } from "./rotation";

describe("normalizeRotation", () => {
  it("maps iPhone -90 to clockwise 270", () => {
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(270)).toBe(270);
    expect(normalizeRotation(90)).toBe(90);
    expect(normalizeRotation(0)).toBe(0);
    expect(normalizeRotation(180)).toBe(180);
    expect(normalizeRotation(360)).toBe(0);
  });
});

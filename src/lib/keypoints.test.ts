import { describe, expect, it } from "vitest";
import {
  sample,
  samplePath,
  upsertMark,
  type PixelPoint,
} from "./keypoints";
import type { Keypoint } from "./types";

const WIDTH = 720;
const HEIGHT = 1280;
const TOLERANCE_PX = 0.5;

function kp(frame: number, x: number, y: number, id = `k${frame}`): Keypoint {
  return { id, frame, x, y };
}

function dist(a: PixelPoint, b: PixelPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

describe("sample(frame) at 720×1280", () => {
  it("returns null when there are no keypoints", () => {
    expect(sample([], 0, WIDTH, HEIGHT)).toBeNull();
  });

  it("glows only on the tagged frame for a single keypoint", () => {
    const marks = [kp(40, 0.42, 0.61)];
    const hit = sample(marks, 40, WIDTH, HEIGHT);
    expect(hit).not.toBeNull();
    expect(dist(hit!, { x: 0.42 * WIDTH, y: 0.61 * HEIGHT })).toBeLessThan(TOLERANCE_PX);
    expect(sample(marks, 39, WIDTH, HEIGHT)).toBeNull();
    expect(sample(marks, 41, WIDTH, HEIGHT)).toBeNull();
  });

  it("interpolates linearly between two keypoints and hits both", () => {
    const marks = [kp(10, 0.2, 0.8), kp(30, 0.7, 0.25)];
    for (const mark of marks) {
      const p = sample(marks, mark.frame, WIDTH, HEIGHT)!;
      expect(dist(p, { x: mark.x * WIDTH, y: mark.y * HEIGHT })).toBeLessThan(TOLERANCE_PX);
    }
    const mid = sample(marks, 20, WIDTH, HEIGHT)!;
    expect(mid.x).toBeCloseTo(((0.2 + 0.7) / 2) * WIDTH, 5);
    expect(mid.y).toBeCloseTo(((0.8 + 0.25) / 2) * HEIGHT, 5);
    expect(sample(marks, 9, WIDTH, HEIGHT)).toBeNull();
    expect(sample(marks, 31, WIDTH, HEIGHT)).toBeNull();
  });

  it("hits each Catmull-Rom keypoint within 0.5px (release, tight, sky, landing)", () => {
    const marks = [
      kp(12, 0.48, 0.72),
      kp(36, 0.51, 0.44),
      kp(90, 0.62, 0.22),
      kp(140, 0.55, 0.18),
      kp(210, 0.41, 0.36),
      kp(268, 0.33, 0.58),
    ];
    for (const mark of marks) {
      const p = sample(marks, mark.frame, WIDTH, HEIGHT);
      expect(p, `missing sample at frame ${mark.frame}`).not.toBeNull();
      const err = dist(p!, { x: mark.x * WIDTH, y: mark.y * HEIGHT });
      expect(err, `frame ${mark.frame} drifted ${err}px`).toBeLessThan(TOLERANCE_PX);
    }
  });

  it("samples every integer frame from first to last", () => {
    const marks = [kp(5, 0.1, 0.2), kp(8, 0.4, 0.3), kp(12, 0.6, 0.5)];
    const path = samplePath(marks, WIDTH, HEIGHT);
    expect(path.map((p) => p.frame)).toEqual([5, 6, 7, 8, 9, 10, 11, 12]);
    for (const mark of marks) {
      const p = path.find((s) => s.frame === mark.frame)!;
      expect(dist(p, { x: mark.x * WIDTH, y: mark.y * HEIGHT })).toBeLessThan(TOLERANCE_PX);
    }
  });

  it("replaces a mark on the same frame instead of adding a second", () => {
    const once = upsertMark([], 18, 0.2, 0.3);
    const twice = upsertMark(once, 18, 0.8, 0.9);
    expect(twice).toHaveLength(1);
    expect(twice[0].frame).toBe(18);
    expect(twice[0].x).toBe(0.8);
    expect(twice[0].y).toBe(0.9);
    expect(twice[0].id).toBe(once[0].id);
  });
});

import { describe, expect, it } from "vitest";
import { clientToNormalized, containMapping } from "./videoCoords";

describe("object-fit contain click mapping (portrait 720×1280)", () => {
  const videoWidth = 720;
  const videoHeight = 1280;

  it("maps clicks on a wide stage through side letterbox bars", () => {
    const container = { left: 0, top: 0, width: 1000, height: 400 };
    const m = containMapping(container.width, container.height, videoWidth, videoHeight);
    expect(m.offsetX).toBeGreaterThan(100);
    expect(m.offsetY).toBeCloseTo(0, 6);
    expect(m.drawHeight).toBeCloseTo(400, 6);

    expect(clientToNormalized(10, 200, container, videoWidth, videoHeight)).toBeNull();
    expect(clientToNormalized(990, 200, container, videoWidth, videoHeight)).toBeNull();

    const origin = clientToNormalized(m.offsetX, m.offsetY, container, videoWidth, videoHeight)!;
    expect(origin.x).toBeCloseTo(0, 6);
    expect(origin.y).toBeCloseTo(0, 6);

    const corner = clientToNormalized(
      m.offsetX + m.drawWidth,
      m.offsetY + m.drawHeight,
      container,
      videoWidth,
      videoHeight,
    )!;
    expect(corner.x).toBeCloseTo(1, 6);
    expect(corner.y).toBeCloseTo(1, 6);

    const center = clientToNormalized(
      m.offsetX + m.drawWidth / 2,
      m.offsetY + m.drawHeight / 2,
      container,
      videoWidth,
      videoHeight,
    )!;
    expect(center.x).toBeCloseTo(0.5, 6);
    expect(center.y).toBeCloseTo(0.5, 6);

    const naiveX = (m.offsetX / container.width) * videoWidth;
    expect(Math.abs(naiveX - 0)).toBeGreaterThan(50);
  });

  it("maps clicks on a tall stage through top/bottom letterbox bars", () => {
    const container = { left: 40, top: 80, width: 360, height: 900 };
    const m = containMapping(container.width, container.height, videoWidth, videoHeight);
    expect(m.offsetY).toBeGreaterThan(10);

    expect(
      clientToNormalized(container.left + 180, container.top + 4, container, videoWidth, videoHeight),
    ).toBeNull();

    const origin = clientToNormalized(
      container.left + m.offsetX,
      container.top + m.offsetY,
      container,
      videoWidth,
      videoHeight,
    )!;
    expect(origin.x).toBeCloseTo(0, 6);
    expect(origin.y).toBeCloseTo(0, 6);
  });
});

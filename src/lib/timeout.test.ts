import { describe, expect, it } from "vitest";
import { HEVC_HELP } from "./featureDetect";
import { DECODE_TIMEOUT, EMPTY_EXPORT_HELP, EXPORT_STALL, EXPORT_STALL_HELP, exportBudgetMs, exportErrorMessage } from "./timeout";

describe("exportErrorMessage", () => {
  it("stays silent on cancel so the editor can restore marks without an error banner", () => {
    expect(exportErrorMessage(new Error("Canceled"))).toBeNull();
  });

  it("surfaces encoder stalls instead of hanging on the overlay", () => {
    expect(exportErrorMessage(new Error(EXPORT_STALL))).toBe(EXPORT_STALL_HELP);
    expect(exportErrorMessage(new Error("ENCODER_UNSUPPORTED: frame encode timed out"))).toBe(
      EXPORT_STALL_HELP,
    );
  });

  it("treats an empty encode as a hard failure, not a successful clip", () => {
    expect(exportErrorMessage(new Error("EMPTY_EXPORT"))).toBe(EMPTY_EXPORT_HELP);
    expect(exportErrorMessage(new Error("Encoder produced an empty file."))).toBe(EMPTY_EXPORT_HELP);
  });

  it("keeps the HEVC help text for decode timeouts", () => {
    expect(exportErrorMessage(new Error(DECODE_TIMEOUT))).toBe(HEVC_HELP);
  });
});

describe("exportBudgetMs", () => {
  it("gives a 448-frame 720p bake at least 12 minutes, not a 3-minute cap", () => {
    expect(exportBudgetMs(448)).toBeGreaterThanOrEqual(12 * 60_000);
    expect(exportBudgetMs(448)).toBeGreaterThan(180_000);
  });
});

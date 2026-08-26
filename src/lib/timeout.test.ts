import { describe, expect, it } from "vitest";
import { HEVC_HELP } from "./featureDetect";
import { DECODE_TIMEOUT, EXPORT_STALL, EXPORT_STALL_HELP, exportErrorMessage } from "./timeout";

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

  it("keeps the HEVC help text for decode timeouts", () => {
    expect(exportErrorMessage(new Error(DECODE_TIMEOUT))).toBe(HEVC_HELP);
  });
});

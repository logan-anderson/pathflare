import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXPORT_STALL, EXPORT_STALL_MS } from "../lib/timeout";
import { watchExportProgress } from "./exportWatchdog";

describe("watchExportProgress", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(performance, "now").mockImplementation(() => Date.now());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("rejects EXPORT_STALL when the encoder never reports a frame", async () => {
    const p = watchExportProgress(
      () => new Promise(() => undefined),
      { cancelled: () => false, onProgress: () => undefined },
      () => undefined,
    );
    const assertion = expect(p).rejects.toThrow(EXPORT_STALL);
    await vi.advanceTimersByTimeAsync(EXPORT_STALL_MS + 1500);
    await assertion;
  });

  it("counts a synchronous first progress ping from start() against the stall clock", async () => {
    const p = watchExportProgress(
      (onProgress) => {
        onProgress(1, 10, 0);
        return new Promise(() => undefined);
      },
      { cancelled: () => false, onProgress: () => undefined },
      () => undefined,
    );
    await vi.advanceTimersByTimeAsync(EXPORT_STALL_MS - 2000);
    let settled = false;
    void p.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await Promise.resolve();
    expect(settled).toBe(false);
  });

  it("does not stall while frames keep arriving", async () => {
    let onProgress: ((frame: number, total: number, etaMs: number) => void) | undefined;
    const p = watchExportProgress(
      (cb) => {
        onProgress = cb;
        return new Promise(() => undefined);
      },
      { cancelled: () => false, onProgress: () => undefined },
      () => undefined,
    );
    for (let i = 0; i < 4; i++) {
      onProgress?.(i + 1, 100, 0);
      await vi.advanceTimersByTimeAsync(EXPORT_STALL_MS - 2000);
    }
    let settled = false;
    void p.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await Promise.resolve();
    expect(settled).toBe(false);
  });

  it("does not hard-timeout a 448-frame bake that is still advancing after 10 minutes", async () => {
    let onProgress: ((frame: number, total: number, etaMs: number) => void) | undefined;
    const p = watchExportProgress(
      (cb) => {
        onProgress = cb;
        return new Promise(() => undefined);
      },
      { cancelled: () => false, onProgress: () => undefined },
      () => undefined,
    );
    for (let i = 1; i <= 30; i++) {
      onProgress?.(Math.min(448, Math.round((i * 448) / 30)), 448, 180_000);
      await vi.advanceTimersByTimeAsync(20_000);
    }
    let settled = false;
    void p.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await Promise.resolve();
    expect(settled).toBe(false);
  });

  it("force-cancels a hung job a few seconds after the user hits Cancel", async () => {
    let cancelled = false;
    const onStall = vi.fn();
    const p = watchExportProgress(
      () => new Promise(() => undefined),
      { cancelled: () => cancelled, onProgress: () => undefined },
      onStall,
    );
    cancelled = true;
    const assertion = expect(p).rejects.toThrow("Canceled");
    await vi.advanceTimersByTimeAsync(4000);
    await assertion;
    expect(onStall).toHaveBeenCalledTimes(1);
  });

  it("calls onStall so the hung worker can be torn down", async () => {
    const onStall = vi.fn();
    const p = watchExportProgress(
      () => new Promise(() => undefined),
      { cancelled: () => false, onProgress: () => undefined },
      onStall,
    );
    const assertion = expect(p).rejects.toThrow(EXPORT_STALL);
    await vi.advanceTimersByTimeAsync(EXPORT_STALL_MS + 1500);
    await assertion;
    expect(onStall).toHaveBeenCalledTimes(1);
  });
});

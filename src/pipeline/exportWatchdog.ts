import { EXPORT_STALL, EXPORT_STALL_MS } from "../lib/timeout";

type ProgressFn = (frame: number, total: number, etaMs: number) => void;

/**
 * Wrap `onProgress` *before* `start` runs so the first frame (including a
 * synchronous ping) resets the stall clock.
 *
 * Idle-only: never kill a bake that is still reporting new frames. A 448-frame
 * 720p clip is allowed to run for the scaled `exportBudgetMs` wall time as
 * long as frames keep arriving. The old 180s hard cap is gone.
 */
export function watchExportProgress<T>(
  start: (onProgress: ProgressFn) => Promise<T>,
  opts: { onProgress: ProgressFn; cancelled: () => boolean },
  onStall: () => void,
): Promise<T> {
  const original = opts.onProgress;
  let lastFrame = -1;
  let lastBump = performance.now();

  const onProgress: ProgressFn = (frame, total, etaMs) => {
    if (frame !== lastFrame) {
      lastFrame = frame;
      lastBump = performance.now();
    }
    original(frame, total, etaMs);
  };

  const job = start(onProgress);

  return new Promise((resolve, reject) => {
    let cancelledAt: number | null = null;
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      globalThis.clearInterval(tick);
      fn();
    };
    const tick = globalThis.setInterval(() => {
      const now = performance.now();
      if (opts.cancelled()) {
        if (cancelledAt == null) cancelledAt = now;
        if (now - cancelledAt >= 3_000) {
          onStall();
          finish(() => reject(new Error("Canceled")));
        }
        return;
      }
      if (now - lastBump <= EXPORT_STALL_MS) return;
      onStall();
      finish(() => reject(new Error(EXPORT_STALL)));
    }, 1000);
    job.then(
      (value) => finish(() => resolve(value)),
      (err: unknown) => finish(() => reject(err)),
    );
  });
}

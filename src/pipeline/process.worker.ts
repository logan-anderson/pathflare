import { firstSampleBitmap, probeFile } from "./demux";
import type { WorkerIn, WorkerOut } from "./messages";
import { processClip } from "./processClip";

const worker = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerIn>) => void) | null;
  postMessage: (message: WorkerOut, transfer?: Transferable[]) => void;
};

let cancelled = false;
let retapResolve: ((point: { x: number; y: number } | null) => void) | null = null;

function post(message: WorkerOut, transfer: Transferable[] = []): void {
  worker.postMessage(message, transfer);
}

worker.onmessage = async (event: MessageEvent<WorkerIn>) => {
  const msg = event.data;
  try {
    switch (msg.type) {
      case "cancel":
        cancelled = true;
        retapResolve?.(null);
        retapResolve = null;
        return;
      case "retap":
        retapResolve?.({ x: msg.x, y: msg.y });
        retapResolve = null;
        return;
      case "probe": {
        const probe = await probeFile(msg.file);
        post({ type: "probe-result", probe });
        return;
      }
      case "first-frame": {
        const result = await firstSampleBitmap(msg.file);
        post(
          {
            type: "first-frame",
            bitmap: result.bitmap,
            width: result.width,
            height: result.height,
            probe: result.probe,
          },
          [result.bitmap],
        );
        return;
      }
      case "process": {
        cancelled = false;
        const result = await processClip(msg.file, {
          sport: msg.sport,
          customColor: msg.customColor,
          seed: msg.seed,
          cancelled: () => cancelled,
          onProgress: (frame, total, etaMs) => {
            post({ type: "progress", frame, total, etaMs });
          },
          onNeedRetap: (bitmap, width, height, frame, total) => {
            post({ type: "need-retap", bitmap, width, height, frame, total }, [bitmap]);
            return new Promise((resolve) => {
              retapResolve = resolve;
            });
          },
        });
        post(
          { type: "done", buffer: result.buffer, mime: result.mime, hasAudio: result.hasAudio },
          [result.buffer],
        );
        return;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    post({ type: "error", message });
  }
};

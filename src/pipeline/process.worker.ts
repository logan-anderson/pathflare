import { probeFile } from "./demux";
import { exportClip } from "./exportClip";
import type { WorkerIn, WorkerOut } from "./messages";

const worker = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerIn>) => void) | null;
  postMessage: (message: WorkerOut, transfer?: Transferable[]) => void;
};

let cancelled = false;

function post(message: WorkerOut, transfer: Transferable[] = []): void {
  worker.postMessage(message, transfer);
}

worker.onmessage = async (event: MessageEvent<WorkerIn>) => {
  const msg = event.data;
  try {
    switch (msg.type) {
      case "cancel":
        cancelled = true;
        return;
      case "probe": {
        const probe = await probeFile(msg.file);
        post({ type: "probe-result", probe });
        return;
      }
      case "export": {
        cancelled = false;
        const result = await exportClip(msg.file, {
          keypoints: msg.keypoints,
          glow: msg.glow,
          width: msg.width,
          height: msg.height,
          frameCount: msg.frameCount,
          fps: msg.fps,
          cancelled: () => cancelled,
          onProgress: (frame, total, etaMs) => {
            post({ type: "progress", frame, total, etaMs });
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

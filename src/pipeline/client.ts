import type { Keypoint, ProbeInfo, SportId } from "../lib/types";
import { detectFeatures } from "../lib/featureDetect";
import { glowFor } from "../lib/presets";
import { DECODE_TIMEOUT, PROBE_TIMEOUT_MS, decodeFailureMessage, isDecodeTimeout, withTimeout } from "../lib/timeout";
import { exportWithVideoElement, probeWithVideoElement } from "./fallback";
import type { WorkerIn, WorkerOut } from "./messages";
import ProcessWorker from "./process.worker.ts?worker";

export type ExportRequest = {
  keypoints: Keypoint[];
  sport: SportId;
  customColor: string;
  width: number;
  height: number;
  frameCount: number;
  fps: number;
  rotation: number;
  cancelled: () => boolean;
  onProgress: (frame: number, total: number, etaMs: number) => void;
};

export type PipelineClient = {
  probe: (file: File) => Promise<ProbeInfo>;
  exportClip: (
    file: File,
    opts: ExportRequest,
  ) => Promise<{ buffer: ArrayBuffer; mime: string; hasAudio: boolean }>;
  cancel: () => void;
  dispose: () => void;
  mode: "webcodecs" | "fallback";
};

export function createPipelineClient(): PipelineClient {
  const features = detectFeatures();
  if (features.pipeline === "webcodecs") {
    return createWorkerClient();
  }
  return createFallbackClient();
}

function createWorkerClient(): PipelineClient {
  let worker = new ProcessWorker();
  let cancelled = false;
  const send = (msg: WorkerIn) => {
    worker.postMessage(msg);
  };

  const once = <T extends WorkerOut["type"]>(type: T) =>
    new Promise<Extract<WorkerOut, { type: T }>>((resolve, reject) => {
      const onMessage = (event: MessageEvent<WorkerOut>) => {
        const data = event.data;
        if (data.type === "error") {
          worker.removeEventListener("message", onMessage);
          reject(new Error(data.message));
          return;
        }
        if (data.type === type) {
          worker.removeEventListener("message", onMessage);
          resolve(data as Extract<WorkerOut, { type: T }>);
        }
      };
      worker.addEventListener("message", onMessage);
    });

  return {
    mode: "webcodecs",
    async probe(file) {
      send({ type: "probe", file });
      try {
        const result = await withTimeout(once("probe-result"), PROBE_TIMEOUT_MS, DECODE_TIMEOUT);
        return result.probe;
      } catch (err) {
        if (isDecodeTimeout(err)) {
          try {
            return await probeWithVideoElement(file);
          } catch {
            throw new Error(decodeFailureMessage(true, "hevc"));
          }
        }
        throw err;
      }
    },
    async exportClip(file, opts) {
      cancelled = false;
      const glow = glowFor(opts.sport, opts.customColor);
      try {
        return await workerExport(worker, send, file, { ...opts, glow }, () => cancelled);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (cancelled || message === "Canceled") throw err;
        if (message.includes("ENCODER_UNSUPPORTED") || message.toLowerCase().includes("encod")) {
          return exportWithVideoElement(file, {
            keypoints: opts.keypoints,
            glow,
            width: opts.width,
            height: opts.height,
            frameCount: opts.frameCount,
            fps: opts.fps,
            rotation: opts.rotation,
            cancelled: () => cancelled || opts.cancelled(),
            onProgress: opts.onProgress,
          });
        }
        throw err;
      }
    },
    cancel() {
      cancelled = true;
      send({ type: "cancel" });
    },
    dispose() {
      cancelled = true;
      send({ type: "cancel" });
      worker.terminate();
      worker = new ProcessWorker();
    },
  };
}

function createFallbackClient(): PipelineClient {
  let cancelled = false;
  return {
    mode: "fallback",
    probe: probeWithVideoElement,
    async exportClip(file, opts) {
      cancelled = false;
      return exportWithVideoElement(file, {
        keypoints: opts.keypoints,
        glow: glowFor(opts.sport, opts.customColor),
        width: opts.width,
        height: opts.height,
        frameCount: opts.frameCount,
        fps: opts.fps,
        rotation: opts.rotation,
        cancelled: () => cancelled || opts.cancelled(),
        onProgress: opts.onProgress,
      });
    },
    cancel() {
      cancelled = true;
    },
    dispose() {
      cancelled = true;
    },
  };
}

function workerExport(
  worker: Worker,
  send: (msg: WorkerIn) => void,
  file: File,
  opts: ExportRequest & { glow: string },
  isCancelled: () => boolean,
): Promise<{ buffer: ArrayBuffer; mime: string; hasAudio: boolean }> {
  send({
    type: "export",
    file,
    keypoints: opts.keypoints,
    glow: opts.glow,
    width: opts.width,
    height: opts.height,
    frameCount: opts.frameCount,
    fps: opts.fps,
  });
  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent<WorkerOut>) => {
      const data = event.data;
      if (data.type === "progress") {
        opts.onProgress(data.frame, data.total, data.etaMs);
        return;
      }
      if (data.type === "done") {
        worker.removeEventListener("message", onMessage);
        resolve({ buffer: data.buffer, mime: data.mime, hasAudio: data.hasAudio });
        return;
      }
      if (data.type === "error") {
        worker.removeEventListener("message", onMessage);
        if (isCancelled()) {
          reject(new Error("Canceled"));
          return;
        }
        reject(new Error(data.message));
      }
    };
    worker.addEventListener("message", onMessage);
  });
}

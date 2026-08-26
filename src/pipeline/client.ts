import type { ProbeInfo, SportId } from "../lib/types";
import { detectFeatures } from "../lib/featureDetect";
import {
  firstFrameWithVideoElement,
  probeWithVideoElement,
  processWithVideoElement,
} from "./fallback";
import type { WorkerIn, WorkerOut } from "./messages";
import ProcessWorker from "./process.worker.ts?worker";

export type PipelineClient = {
  probe: (file: File) => Promise<ProbeInfo>;
  firstFrame: (file: File) => Promise<{ bitmap: ImageBitmap; width: number; height: number; probe: ProbeInfo }>;
  process: (
    file: File,
    opts: {
      sport: SportId;
      customColor: string;
      seed: { x: number; y: number };
      cancelled: () => boolean;
      onProgress: (frame: number, total: number, etaMs: number) => void;
      onNeedRetap: (
        bitmap: ImageBitmap,
        width: number,
        height: number,
        frame: number,
        total: number,
      ) => Promise<{ x: number; y: number } | null>;
    },
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
      const result = await once("probe-result");
      return result.probe;
    },
    async firstFrame(file) {
      send({ type: "first-frame", file });
      try {
        return await once("first-frame");
      } catch {
        return firstFrameWithVideoElement(file);
      }
    },
    async process(file, opts) {
      cancelled = false;
      send({
        type: "process",
        file,
        sport: opts.sport,
        customColor: opts.customColor,
        seed: opts.seed,
      });
      return new Promise((resolve, reject) => {
        const onMessage = async (event: MessageEvent<WorkerOut>) => {
          const data = event.data;
          if (data.type === "progress") {
            opts.onProgress(data.frame, data.total, data.etaMs);
            return;
          }
          if (data.type === "need-retap") {
            const point = await opts.onNeedRetap(
              data.bitmap,
              data.width,
              data.height,
              data.frame,
              data.total,
            );
            if (!point || cancelled) {
              send({ type: "cancel" });
              worker.removeEventListener("message", onMessage);
              reject(new Error("Canceled"));
              return;
            }
            send({ type: "retap", x: point.x, y: point.y });
            return;
          }
          if (data.type === "done") {
            worker.removeEventListener("message", onMessage);
            resolve({ buffer: data.buffer, mime: data.mime, hasAudio: data.hasAudio });
            return;
          }
          if (data.type === "error") {
            worker.removeEventListener("message", onMessage);
            reject(new Error(data.message));
          }
        };
        worker.addEventListener("message", onMessage);
      });
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
    firstFrame: firstFrameWithVideoElement,
    async process(file, opts) {
      cancelled = false;
      return processWithVideoElement(file, {
        ...opts,
        cancelled: () => cancelled || opts.cancelled(),
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

import type { Keypoint, ProbeInfo } from "../lib/types";

export type WorkerIn =
  | { type: "probe"; file: File }
  | {
      type: "export";
      file: File;
      keypoints: Keypoint[];
      glow: string;
      width: number;
      height: number;
      frameCount: number;
      fps: number;
    }
  | { type: "cancel" };

export type WorkerOut =
  | { type: "probe-result"; probe: ProbeInfo }
  | { type: "progress"; frame: number; total: number; etaMs: number }
  | { type: "done"; buffer: ArrayBuffer; mime: string; hasAudio: boolean }
  | { type: "error"; message: string };

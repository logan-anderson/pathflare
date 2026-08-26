export type WorkerIn =
  | { type: "probe"; file: File }
  | { type: "first-frame"; file: File }
  | { type: "process"; file: File; sport: "disc" | "golf" | "basketball" | "custom"; customColor: string; seed: { x: number; y: number } }
  | { type: "retap"; x: number; y: number }
  | { type: "cancel" };

export type WorkerOut =
  | { type: "probe-result"; probe: import("../lib/types").ProbeInfo }
  | { type: "first-frame"; bitmap: ImageBitmap; width: number; height: number; probe: import("../lib/types").ProbeInfo }
  | { type: "progress"; frame: number; total: number; etaMs: number }
  | { type: "need-retap"; bitmap: ImageBitmap; width: number; height: number; frame: number; total: number }
  | { type: "done"; buffer: ArrayBuffer; mime: string; hasAudio: boolean }
  | { type: "error"; message: string };

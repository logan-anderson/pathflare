export type SportId = "disc" | "golf" | "basketball" | "custom";

export type Point = {
  x: number;
  y: number;
  t: number;
};

export type TrailSegment = Point[];

export type Preset = {
  id: SportId;
  label: string;
  hint: string;
  glow: string;
  templateSize: number;
  roiScale: number;
  missWiden: number;
  processNoise: number;
  measNoise: number;
  nccMin: number;
  colorMin: number;
  circularityWeight: number;
  allowEllipse: boolean;
};

export type ProbeInfo = {
  durationSec: number;
  codedWidth: number;
  codedHeight: number;
  displayWidth: number;
  displayHeight: number;
  processWidth: number;
  processHeight: number;
  codec: string | null;
  codecString: string | null;
  canDecode: boolean;
  isHevc: boolean;
  is4k: boolean;
  overDuration: boolean;
  overPhoneBudget: boolean;
  rotation: 0 | 90 | 180 | 270;
  hasAudio: boolean;
  frameCount: number;
};

export type ProcessRequest = {
  file: File;
  sport: SportId;
  customColor: string;
  seed: { x: number; y: number };
};

export type ProgressInfo = {
  frame: number;
  total: number;
  etaMs: number;
};

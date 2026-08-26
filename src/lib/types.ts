export type SportId = "disc" | "golf" | "basketball" | "custom";

export type Point = {
  x: number;
  y: number;
  t: number;
};

export type TrailSegment = Point[];

export type Keypoint = {
  id: string;
  /** Integer frame index in 0..frameCount-1 */
  frame: number;
  /** Normalized video x, origin top-left */
  x: number;
  /** Normalized video y, origin top-left */
  y: number;
};

export type Project = {
  frameCount: number;
  width: number;
  height: number;
  fps: number;
  keypoints: Keypoint[];
};

export type GlowPreset = {
  id: SportId;
  label: string;
  hint: string;
  glow: string;
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
  is1080: boolean;
  overDuration: boolean;
  overPhoneBudget: boolean;
  rotation: 0 | 90 | 180 | 270;
  hasAudio: boolean;
  frameCount: number;
};

export type ProgressInfo = {
  frame: number;
  total: number;
  etaMs: number;
};

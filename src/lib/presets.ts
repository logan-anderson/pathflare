import type { Preset, SportId } from "./types";

export const SPORTS: Preset[] = [
  {
    id: "disc",
    label: "Disc",
    hint: "Bright disc against sky or trees. Ellipse lock is allowed.",
    glow: "#2ee6c5",
    templateSize: 44,
    roiScale: 2.6,
    missWiden: 1.55,
    processNoise: 55,
    measNoise: 7,
    nccMin: 0.28,
    colorMin: 0.22,
    circularityWeight: 0.18,
    allowEllipse: true,
  },
  {
    id: "golf",
    label: "Golf ball",
    hint: "Stretch goal. Use a close, well-lit shot — fast blur often loses lock.",
    glow: "#d7f5ff",
    templateSize: 16,
    roiScale: 3.4,
    missWiden: 1.8,
    processNoise: 90,
    measNoise: 10,
    nccMin: 0.32,
    colorMin: 0.18,
    circularityWeight: 0.35,
    allowEllipse: false,
  },
  {
    id: "basketball",
    label: "Basketball",
    hint: "Indoor or outdoor; tap the ball on the first frame.",
    glow: "#ff8a4c",
    templateSize: 56,
    roiScale: 2.4,
    missWiden: 1.45,
    processNoise: 48,
    measNoise: 8,
    nccMin: 0.26,
    colorMin: 0.2,
    circularityWeight: 0.28,
    allowEllipse: false,
  },
  {
    id: "custom",
    label: "Custom color",
    hint: "Pick a trail color, then tap the object.",
    glow: "#7c5cff",
    templateSize: 40,
    roiScale: 2.7,
    missWiden: 1.5,
    processNoise: 60,
    measNoise: 8,
    nccMin: 0.28,
    colorMin: 0.2,
    circularityWeight: 0.15,
    allowEllipse: true,
  },
];

export function presetById(id: SportId): Preset {
  return SPORTS.find((p) => p.id === id) ?? SPORTS[0];
}

export function glowFor(sport: SportId, customColor: string): string {
  if (sport === "custom" && customColor) return customColor;
  return presetById(sport).glow;
}

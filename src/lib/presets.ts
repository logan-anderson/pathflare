import type { GlowPreset, SportId } from "./types";

export const SPORTS: GlowPreset[] = [
  {
    id: "disc",
    label: "Disc",
    hint: "Cyan glow. Mark release, then sky and landing — the object does not need to stay visible.",
    glow: "#2ee6c5",
  },
  {
    id: "golf",
    label: "Golf ball",
    hint: "Cool white glow. Mark the perceived flight, including after the ball leaves the frame.",
    glow: "#d7f5ff",
  },
  {
    id: "basketball",
    label: "Basketball",
    hint: "Orange glow. A few marks through the arc are enough.",
    glow: "#ff8a4c",
  },
  {
    id: "custom",
    label: "Custom color",
    hint: "Pick a glow color, then mark the flight on the timeline.",
    glow: "#7c5cff",
  },
];

export function presetById(id: SportId): GlowPreset {
  return SPORTS.find((p) => p.id === id) ?? SPORTS[0];
}

export function glowFor(sport: SportId, customColor: string): string {
  if (sport === "custom" && customColor) return customColor;
  return presetById(sport).glow;
}

/**
 * Encode/mux timestamps must be >= 0. Source packets may be slightly negative
 * (AAC encoder delay, edit lists). 1024 samples @ 48 kHz is exactly
 * 0.021333…s — the production export failure on Logan's H.264 throw.
 */
export function clampTimestamp(seconds: number): number {
  if (!Number.isFinite(seconds)) return 0;
  return Math.max(0, seconds);
}

export function clampDuration(seconds: number, fallback = 0): number {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
  }
  return seconds;
}

export type PacketTiming = { timestamp: number; duration: number };

/**
 * Shift a packet onto t>=0. Returns null when the packet ends at or before 0
 * (priming / skip samples that must not be muxed).
 */
export function clampPacketTiming(timestamp: number, duration: number): PacketTiming | null {
  const ts = Number.isFinite(timestamp) ? timestamp : 0;
  const dur = Number.isFinite(duration) && duration > 0 ? duration : 0;
  if (ts >= 0) return { timestamp: ts, duration: dur };
  const end = ts + dur;
  if (end <= 0) return null;
  return { timestamp: 0, duration: end };
}

export function isNegativeTimestampError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /timestamps must be non-negative/i.test(message);
}

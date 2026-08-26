export async function requestWakeLock(): Promise<{ release: () => Promise<void> }> {
  const nav = navigator as Navigator & {
    wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
  };
  if (!nav.wakeLock) {
    return { release: async () => undefined };
  }
  try {
    const lock = await nav.wakeLock.request("screen");
    return {
      release: async () => {
        try {
          await lock.release();
        } catch {
          /* ignore */
        }
      },
    };
  } catch {
    return { release: async () => undefined };
  }
}

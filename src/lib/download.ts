import {
  isIOS,
  isWebKit,
  shouldAttemptAutoDownload,
  type NavSnapshot,
} from "./featureDetect";

export const AUTO_DOWNLOAD_GRACE_MS = 2_000;

export type SaveResult = "shared" | "downloaded" | "opened" | "cancelled";

/** How long the overlay stays on Saving… after the blob is ready. */
export function autoDownloadGraceMs(nav?: NavSnapshot): number {
  return shouldAttemptAutoDownload(nav) ? AUTO_DOWNLOAD_GRACE_MS : 0;
}

export function toExportFile(blob: Blob, name: string): File {
  return new File([blob], name, { type: blob.type || "video/mp4" });
}

export function canShareClipFile(file: File): boolean {
  if (typeof navigator === "undefined") return false;
  if (typeof navigator.share !== "function") return false;
  if (typeof navigator.canShare !== "function") return false;
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export function isShareAbort(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = "name" in err ? String((err as { name?: unknown }).name) : "";
  return name === "AbortError";
}

/** Trigger a file download from a blob or object URL. Desktop Chromium only for auto-save. */
export function startBlobDownload(url: string, filename: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function openBlobPreview(url: string): void {
  if (typeof window === "undefined") return;
  window.open(url, "_blank", "noopener");
}

/**
 * User-gesture save. Prefer the iOS share sheet (Save Video / Files / Photos).
 * Fall back to a tapped `<a download>` and, on WebKit, opening the blob URL
 * because the download attribute is ignored for blob: URLs.
 */
export async function saveExportedClip(
  opts: { file: File; url: string },
  nav?: NavSnapshot,
): Promise<SaveResult> {
  if (canShareClipFile(opts.file)) {
    try {
      await navigator.share({ files: [opts.file], title: opts.file.name });
      return "shared";
    } catch (err) {
      if (isShareAbort(err)) return "cancelled";
    }
  }
  startBlobDownload(opts.url, opts.file.name);
  if (isIOS(nav) || isWebKit(nav) || !shouldAttemptAutoDownload(nav)) {
    openBlobPreview(opts.url);
    return "opened";
  }
  return "downloaded";
}

/**
 * Click handler for a real `<a download>` save button.
 * On desktop Chromium, the native download proceeds. Elsewhere we prevent
 * default (iOS would otherwise open blob: in the same tab) and share/open.
 */
export async function onSaveButtonClick(
  event: { preventDefault: () => void },
  opts: { file: File; url: string },
  nav?: NavSnapshot,
): Promise<SaveResult> {
  if (canShareClipFile(opts.file) || !shouldAttemptAutoDownload(nav)) {
    event.preventDefault();
    return saveExportedClip(opts, nav);
  }
  return "downloaded";
}

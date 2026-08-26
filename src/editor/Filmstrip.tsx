import { useEffect, useRef } from "react";
import { drawVideoToDisplay, seekVideo } from "../lib/rotation";

const STRIP_COUNT = 12;

type FilmstripProps = {
  file: File;
  duration: number;
  frameCount: number;
  frame: number;
  rotation: number;
  displayWidth: number;
  displayHeight: number;
  onFrame: (frame: number) => void;
};

export function Filmstrip({
  file,
  duration,
  frameCount,
  frame,
  rotation,
  displayWidth,
  displayHeight,
  onFrame,
}: FilmstripProps) {
  const canvases = useRef<Array<HTMLCanvasElement | null>>([]);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    urlRef.current = url;
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;
    let cancelled = false;

    (async () => {
      try {
        await new Promise<void>((resolve, reject) => {
          video.onloadeddata = () => resolve();
          video.onerror = () => reject(new Error("filmstrip"));
        });
        const times = Array.from({ length: STRIP_COUNT }, (_, i) => {
          const u = i / (STRIP_COUNT - 1);
          return Math.min(duration * 0.999, u * duration);
        });
        for (let i = 0; i < times.length; i++) {
          if (cancelled) return;
          await seekVideo(video, times[i]);
          const canvas = canvases.current[i];
          if (!canvas) continue;
          const ctx = canvas.getContext("2d", { alpha: false });
          if (!ctx) continue;
          const w = canvas.width;
          const h = canvas.height;
          drawVideoToDisplay(ctx, video, w, h, rotation);
        }
      } catch {
        /* thumbs are optional */
      }
    })();

    return () => {
      cancelled = true;
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
    };
  }, [file, duration, rotation, displayWidth, displayHeight]);

  const max = Math.max(1, frameCount - 1);

  return (
    <div className="filmstrip" role="listbox" aria-label="Scrub filmstrip">
      {Array.from({ length: STRIP_COUNT }, (_, i) => {
        const u = i / (STRIP_COUNT - 1);
        const f = Math.round(u * max);
        const active = Math.abs(frame - f) <= Math.ceil(max / STRIP_COUNT / 2);
        return (
          <button
            key={i}
            type="button"
            role="option"
            aria-selected={active}
            className={active ? "thumb on" : "thumb"}
            onClick={() => onFrame(f)}
          >
            <canvas
              ref={(el) => {
                canvases.current[i] = el;
              }}
              width={Math.round(displayWidth / 8)}
              height={Math.round(displayHeight / 8)}
            />
          </button>
        );
      })}
    </div>
  );
}

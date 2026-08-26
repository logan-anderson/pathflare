import { useCallback, useRef, useState } from "react";
import type { CSSProperties, PointerEvent, RefObject } from "react";
import { containMapping } from "../lib/videoCoords";

export type ViewTransform = { scale: number; panX: number; panY: number };

const MIN_SCALE = 1;
const MAX_SCALE = 5;

export function useStageView(containerRef: RefObject<HTMLElement | null>) {
  const [view, setView] = useState<ViewTransform>({ scale: 1, panX: 0, panY: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; scale: number; panX: number; panY: number } | null>(null);

  const clampView = useCallback((next: ViewTransform): ViewTransform => {
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next.scale));
    if (scale <= 1.01) return { scale: 1, panX: 0, panY: 0 };
    const el = containerRef.current;
    const maxX = el ? (el.clientWidth * (scale - 1)) / 2 + 24 : 240;
    const maxY = el ? (el.clientHeight * (scale - 1)) / 2 + 24 : 240;
    return {
      scale,
      panX: Math.min(maxX, Math.max(-maxX, next.panX)),
      panY: Math.min(maxY, Math.max(-maxY, next.panY)),
    };
  }, [containerRef]);

  const zoomAt = useCallback((clientX: number, clientY: number, factor: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = clientX - rect.left - rect.width / 2;
    const cy = clientY - rect.top - rect.height / 2;
    setView((prev) => {
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev.scale * factor));
      const t = scale / prev.scale;
      return clampView({
        scale,
        panX: (prev.panX - cx) * t + cx,
        panY: (prev.panY - cy) * t + cy,
      });
    });
  }, [clampView, containerRef]);

  function onPointerDown(e: PointerEvent) {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        scale: view.scale,
        panX: view.panX,
        panY: view.panY,
      };
    }
  }

  function onPointerMove(e: PointerEvent): "pinch" | "one" | "none" {
    if (!pointers.current.has(e.pointerId)) return "none";
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const origin = pinch.current;
      const factor = dist / Math.max(8, origin.distance);
      setView(clampView({
        scale: origin.scale * factor,
        panX: origin.panX,
        panY: origin.panY,
      }));
      return "pinch";
    }
    return "one";
  }

  function onPointerUp(e: PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  }

  const onWheel = useCallback((e: { clientX: number; clientY: number; deltaY: number }) => {
    const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
    zoomAt(e.clientX, e.clientY, factor);
  }, [zoomAt]);

  return { view, setView, clampView, onPointerDown, onPointerMove, onPointerUp, onWheel, zoomAt };
}

export function worldStyle(
  containerW: number,
  containerH: number,
  videoW: number,
  videoH: number,
  view: ViewTransform,
): CSSProperties {
  const m = containMapping(containerW, containerH, videoW, videoH);
  return {
    left: m.offsetX,
    top: m.offsetY,
    width: m.drawWidth,
    height: m.drawHeight,
    transform: `translate(${view.panX}px, ${view.panY}px) scale(${view.scale})`,
    transformOrigin: "center center",
  };
}

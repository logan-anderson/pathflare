import { useEffect, useRef } from "react";
import type { PointerEvent, RefObject } from "react";
import {
  HANDLE_HIT_SCREEN_PX,
  drawEditorOverlay,
} from "./drawEditorOverlay";
import { hitTestHandle, type Keypoint } from "../lib/keypoints";
import { drawVideoToDisplay } from "../lib/rotation";
import { screenPxToVideoPx } from "../lib/videoCoords";
import { worldStyle, type ViewTransform } from "./useStageView";

type StageProps = {
  videoRef: RefObject<HTMLVideoElement | null>;
  width: number;
  height: number;
  rotation: number;
  frame: number;
  keypoints: Keypoint[];
  selectedId: string | null;
  glow: string;
  view: ViewTransform;
  containerSize: { width: number; height: number };
  reticle: { x: number; y: number };
  coarse: boolean;
  onReticle: (x: number, y: number) => void;
  onPlace: (x: number, y: number) => void;
  onSelect: (id: string) => void;
  onMoveHandle: (id: string, x: number, y: number, commit: boolean) => void;
  onPointerActivity: (kind: "down" | "move" | "up" | "cancel", e: PointerEvent) => "pinch" | "one" | "none";
  onWheel: (e: { clientX: number; clientY: number; deltaY: number }) => void;
};

export function Stage(props: StageProps) {
  const videoCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const stageBoxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string } | null>(null);

  const {
    videoRef, width, height, rotation, frame, keypoints, selectedId, glow, view,
    containerSize, reticle, coarse, onReticle, onPlace, onSelect, onMoveHandle,
    onPointerActivity, onWheel,
  } = props;

  useEffect(() => {
    const video = videoRef.current;
    const canvas = videoCanvasRef.current;
    if (!video || !canvas) return;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;
    const paint = () => {
      if (video.readyState >= 2) {
        drawVideoToDisplay(ctx, video, width, height, rotation);
      }
    };
    paint();
    video.addEventListener("seeked", paint);
    video.addEventListener("timeupdate", paint);
    video.addEventListener("loadeddata", paint);
    return () => {
      video.removeEventListener("seeked", paint);
      video.removeEventListener("timeupdate", paint);
      video.removeEventListener("loadeddata", paint);
    };
  }, [videoRef, width, height, rotation, frame]);

  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const mappingScale = containScale(containerSize.width, containerSize.height, width, height) * view.scale;
    const videoPerScreen = mappingScale > 0 ? 1 / mappingScale : 1;
    drawEditorOverlay(ctx, width, height, keypoints, frame, glow, selectedId, videoPerScreen);
  }, [width, height, keypoints, frame, glow, selectedId, containerSize, view.scale]);

  useEffect(() => {
    const el = stageBoxRef.current;
    if (!el) return;
    const handleWheel = (event: globalThis.WheelEvent) => {
      event.preventDefault();
      onWheel(event);
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [onWheel]);

  function localNormalized(e: PointerEvent): { x: number; y: number } | null {
    const world = worldRef.current;
    if (!world) return null;
    const rect = world.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return null;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return { x, y };
  }

  function reticleFromEvent(e: PointerEvent): { x: number; y: number } | null {
    const world = worldRef.current;
    if (!world) return localNormalized(e);
    const rect = world.getBoundingClientRect();
    const lift = coarse ? 56 : 0;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - lift - rect.top) / rect.height;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return {
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y)),
    };
  }

  function hitRadius(): number {
    const mappingScale = containScale(containerSize.width, containerSize.height, width, height) * view.scale;
    return screenPxToVideoPx(HANDLE_HIT_SCREEN_PX / 2, {
      offsetX: 0,
      offsetY: 0,
      drawWidth: width * mappingScale,
      drawHeight: height * mappingScale,
      scale: mappingScale,
      containerWidth: containerSize.width,
      containerHeight: containerSize.height,
      videoWidth: width,
      videoHeight: height,
    });
  }

  return (
    <div ref={stageBoxRef} className="stage">
      <video ref={videoRef} className="stage-video" playsInline preload="auto" />
      <div
        ref={worldRef}
        className="stage-world"
        style={worldStyle(containerSize.width, containerSize.height, width, height, view)}
        onPointerDown={(e) => {
          const kind = onPointerActivity("down", e);
          if (kind === "pinch") return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const pos = coarse ? reticleFromEvent(e) : localNormalized(e);
          if (!pos) return;
          const hit = hitTestHandle(keypoints, pos.x * width, pos.y * height, width, height, hitRadius());
          if (hit) {
            onSelect(hit.id);
            drag.current = { id: hit.id };
            return;
          }
          onReticle(pos.x, pos.y);
          if (!coarse && e.pointerType !== "touch") {
            onPlace(pos.x, pos.y);
          }
        }}
        onPointerMove={(e) => {
          const kind = onPointerActivity("move", e);
          if (kind === "pinch") return;
          if (drag.current) {
            const pos = localNormalized(e);
            if (!pos) return;
            onMoveHandle(drag.current.id, pos.x, pos.y, false);
            onReticle(pos.x, pos.y);
            return;
          }
          const pos = coarse || e.pointerType === "touch" ? reticleFromEvent(e) : localNormalized(e);
          if (pos) onReticle(pos.x, pos.y);
        }}
        onPointerUp={(e) => {
          onPointerActivity("up", e);
          if (drag.current) {
            const pos = localNormalized(e) ?? { x: reticle.x, y: reticle.y };
            onMoveHandle(drag.current.id, pos.x, pos.y, true);
            drag.current = null;
          }
        }}
        onPointerCancel={(e) => {
          onPointerActivity("cancel", e);
          drag.current = null;
        }}
      >
        <canvas ref={videoCanvasRef} className="stage-frame" />
        <canvas ref={overlayRef} className="stage-overlay" />
        <div
          className="reticle"
          style={{ left: `${reticle.x * 100}%`, top: `${reticle.y * 100}%` }}
          aria-hidden
        >
          <i />
        </div>
      </div>
    </div>
  );
}

function containScale(containerW: number, containerH: number, videoW: number, videoH: number): number {
  return Math.min(containerW / Math.max(1, videoW), containerH / Math.max(1, videoH));
}

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

/** Screen pixels of movement before a handle press becomes a drag. */
const HANDLE_DRAG_SLOP_PX = 10;

type PointerSession = {
  startClientX: number;
  startClientY: number;
  startPos: { x: number; y: number };
  handleId: string | null;
  dragging: boolean;
};

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
  showTrail: boolean;
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
  const session = useRef<PointerSession | null>(null);

  const {
    videoRef, width, height, rotation, frame, keypoints, selectedId, glow, view,
    containerSize, reticle, coarse, showTrail, onReticle, onPlace, onSelect, onMoveHandle,
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
    drawEditorOverlay(ctx, width, height, keypoints, frame, glow, selectedId, videoPerScreen, showTrail);
  }, [width, height, keypoints, frame, glow, selectedId, containerSize, view.scale, showTrail]);

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

  function placePos(e: PointerEvent, fallback: { x: number; y: number }): { x: number; y: number } {
    if (coarse || e.pointerType === "touch") {
      return reticleFromEvent(e) ?? fallback;
    }
    return localNormalized(e) ?? fallback;
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
          if (kind === "pinch") {
            session.current = null;
            return;
          }
          e.currentTarget.setPointerCapture(e.pointerId);
          const pos = placePos(e, reticle);
          const hit = hitTestHandle(keypoints, pos.x * width, pos.y * height, width, height, hitRadius());
          session.current = {
            startClientX: e.clientX,
            startClientY: e.clientY,
            startPos: pos,
            handleId: hit?.id ?? null,
            dragging: false,
          };
          onReticle(pos.x, pos.y);
        }}
        onPointerMove={(e) => {
          const kind = onPointerActivity("move", e);
          if (kind === "pinch") {
            session.current = null;
            return;
          }
          const active = session.current;
          const pos = placePos(e, active?.startPos ?? reticle);
          if (active && !active.dragging && active.handleId) {
            const dist = Math.hypot(e.clientX - active.startClientX, e.clientY - active.startClientY);
            if (dist >= HANDLE_DRAG_SLOP_PX) {
              active.dragging = true;
              onSelect(active.handleId);
            }
          }
          if (active?.dragging && active.handleId) {
            const movePos = localNormalized(e) ?? pos;
            onMoveHandle(active.handleId, movePos.x, movePos.y, false);
            onReticle(movePos.x, movePos.y);
            return;
          }
          onReticle(pos.x, pos.y);
        }}
        onPointerUp={(e) => {
          onPointerActivity("up", e);
          const active = session.current;
          session.current = null;
          if (!active) return;
          if (active.dragging && active.handleId) {
            const pos = localNormalized(e) ?? { x: reticle.x, y: reticle.y };
            onMoveHandle(active.handleId, pos.x, pos.y, true);
            return;
          }
          if (!coarse && e.pointerType !== "touch") {
            const pos = localNormalized(e) ?? active.startPos;
            onPlace(pos.x, pos.y);
          }
        }}
        onPointerCancel={(e) => {
          onPointerActivity("cancel", e);
          session.current = null;
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

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { Filmstrip } from "./Filmstrip";
import { Stage } from "./Stage";
import { Timeline } from "./Timeline";
import { useStageView } from "./useStageView";
import { clipDurationSec, TARGET_FPS } from "../lib/clipBudget";
import {
  deleteKeypoint,
  keypointsEqual,
  moveKeypoint,
  upsertMark,
  type Keypoint,
} from "../lib/keypoints";
import type { ProbeInfo } from "../lib/types";

type Hist = { past: Keypoint[][]; present: Keypoint[]; future: Keypoint[][] };

type HistAction =
  | { type: "commit"; value: Keypoint[] }
  | { type: "replace"; value: Keypoint[] }
  | { type: "undo" }
  | { type: "redo" };

function histReducer(state: Hist, action: HistAction): Hist {
  switch (action.type) {
    case "replace":
      return { ...state, present: action.value };
    case "commit":
      if (keypointsEqual(action.value, state.present)) return state;
      return {
        past: [...state.past, state.present].slice(-80),
        present: action.value,
        future: [],
      };
    case "undo": {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
      };
    }
    case "redo": {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      return {
        past: [...state.past, state.present],
        present: next,
        future: state.future.slice(1),
      };
    }
    default:
      return state;
  }
}

type EditorProps = {
  file: File;
  probe: ProbeInfo;
  glow: string;
  locked?: boolean;
  showTrail: boolean;
  onToggleTrail: () => void;
  onBack: () => void;
  onExport: (keypoints: Keypoint[]) => void;
};

export function Editor({
  file,
  probe,
  glow,
  locked = false,
  showTrail,
  onToggleTrail,
  onBack,
  onExport,
}: EditorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const urlRef = useRef<string | null>(null);
  const [hist, dispatch] = useReducer(histReducer, { past: [], present: [], future: [] });
  const keypoints = hist.present;
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reticle, setReticle] = useState({ x: 0.5, y: 0.5 });
  const [hint, setHint] = useState("");
  const [videoError, setVideoError] = useState<string | null>(null);
  const [coarse, setCoarse] = useState(false);
  const [containerSize, setContainerSize] = useState({ width: 360, height: 480 });
  const viewCtl = useStageView(stageRef);

  const width = probe.processWidth;
  const height = probe.processHeight;
  const fps = TARGET_FPS;
  const duration = clipDurationSec(probe.durationSec);
  const frameCount = probe.frameCount;
  const maxFrame = Math.max(0, frameCount - 1);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const sync = () => setCoarse(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    urlRef.current = url;
    const video = videoRef.current;
    if (video) {
      video.src = url;
      video.onerror = () => {
        setVideoError(
          probe.isHevc
            ? "This browser could not decode the HEVC clip. Open Pathflare in Safari, or re-export as Most Compatible (H.264)."
            : "This browser could not decode the video.",
        );
      };
    }
    return () => {
      if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
      URL.revokeObjectURL(url);
    };
  }, [file, probe.isHevc]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setContainerSize({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);
    setContainerSize({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const seekTo = useCallback((next: number, pause = true) => {
    const f = Math.max(0, Math.min(maxFrame, Math.round(next)));
    setFrame(f);
    const video = videoRef.current;
    if (video) {
      if (pause) {
        video.pause();
        setPlaying(false);
      }
      const t = Math.min(Math.max(0, duration - 0.0008), f / fps);
      if (Math.abs(video.currentTime - t) > 1 / (fps * 4)) {
        video.currentTime = t;
      }
    }
  }, [duration, fps, maxFrame]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTime = () => {
      const f = Math.max(0, Math.min(maxFrame, Math.round(video.currentTime * fps)));
      setFrame(f);
      if (video.currentTime >= duration - 0.05) {
        video.pause();
        setPlaying(false);
      }
    };
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("seeked", onTime);
    return () => {
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("seeked", onTime);
    };
  }, [duration, fps, maxFrame]);

  const placeAt = useCallback((x: number, y: number) => {
    const next = upsertMark(keypoints, frame, x, y);
    dispatch({ type: "commit", value: next });
    const placed = next.find((k) => k.frame === frame);
    if (placed) setSelectedId(placed.id);
    setReticle({ x, y });
  }, [frame, keypoints]);

  const addMark = useCallback(() => {
    placeAt(reticle.x, reticle.y);
    setHint("Mark placed at this time.");
  }, [placeAt, reticle.x, reticle.y]);

  useEffect(() => {
    if (locked) {
      videoRef.current?.pause();
      setPlaying(false);
    }
  }, [locked]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (locked) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      const step = e.shiftKey ? 10 : 1;
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
        return;
      }
      if (e.key === "j" || e.key === "J" || e.key === "ArrowLeft") {
        e.preventDefault();
        seekTo(frame - step);
        return;
      }
      if (e.key === "k" || e.key === "K" || e.key === "ArrowRight") {
        e.preventDefault();
        seekTo(frame + step);
        return;
      }
      if ((e.key === "z" || e.key === "Z") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
        return;
      }
      if ((e.key === "y" || e.key === "Y") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        dispatch({ type: "redo" });
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (!selectedId) return;
        e.preventDefault();
        dispatch({ type: "commit", value: deleteKeypoint(keypoints, selectedId) });
        setSelectedId(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (playing) {
      video.pause();
      setPlaying(false);
      return;
    }
    void video.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }

  function pointerActivity(kind: "down" | "move" | "up" | "cancel", e: PointerEvent) {
    if (kind === "down") {
      if (playing) {
        videoRef.current?.pause();
        setPlaying(false);
      }
      viewCtl.onPointerDown(e);
      return viewCtl.onPointerMove(e);
    }
    if (kind === "move") return viewCtl.onPointerMove(e);
    viewCtl.onPointerUp(e);
    return "none" as const;
  }

  const curveHint =
    keypoints.length <= 1
      ? "Add 4–10 marks along the flight. Two marks make a straight line; three or more make a smooth curve."
      : keypoints.length === 2
        ? "Straight line between two marks. Add a third for a smooth curve."
        : `${keypoints.length} marks · live curve. Pause where it misses and add another mark.`;

  return (
    <main className="editor" aria-hidden={locked || undefined} {...(locked ? { inert: true } : {})}>
      <p className="lede editor-lede">Mark the flight, we draw the glow.</p>
      <p className="muted">{curveHint} Export bakes the same curve into the clip.</p>
      {coarse && (
        <p className="muted">
          Drag the reticle so it sits on the path — your finger stays out of the way — then Add mark.
        </p>
      )}
      {videoError && (
        <div className="banner danger" role="alert">
          {videoError}
        </div>
      )}
      <div ref={stageRef} className="stage-shell">
        <Stage
          videoRef={videoRef}
          width={width}
          height={height}
          rotation={probe.rotation}
          frame={frame}
          keypoints={keypoints}
          selectedId={selectedId}
          glow={glow}
          view={viewCtl.view}
          containerSize={containerSize}
          reticle={reticle}
          coarse={coarse}
          showTrail={showTrail}
          onReticle={(x, y) => setReticle({ x, y })}
          onPlace={placeAt}
          onSelect={setSelectedId}
          onMoveHandle={(id, x, y, commit) => {
            const next = moveKeypoint(keypoints, id, x, y);
            dispatch({ type: commit ? "commit" : "replace", value: next });
          }}
          onPointerActivity={pointerActivity}
          onWheel={viewCtl.onWheel}
        />
      </div>
      <div className="editor-meta">
        <span>{keypoints.length} marks</span>
        {hint && <span className="muted">{hint}</span>}
      </div>
      <Timeline
        frame={frame}
        frameCount={frameCount}
        keypoints={keypoints}
        selectedId={selectedId}
        onFrame={(f) => seekTo(f)}
        onSelect={setSelectedId}
      />
      <Filmstrip
        file={file}
        duration={duration}
        frameCount={frameCount}
        frame={frame}
        rotation={probe.rotation}
        displayWidth={width}
        displayHeight={height}
        onFrame={(f) => seekTo(f)}
      />
      <div className="row editor-actions">
        <button type="button" className="secondary" onClick={onBack}>
          Back
        </button>
        <button type="button" className="secondary" onClick={togglePlay}>
          {playing ? "Pause" : "Play"}
        </button>
        <button type="button" className="secondary" onClick={() => dispatch({ type: "undo" })} disabled={hist.past.length === 0}>
          Undo
        </button>
        <button type="button" className="secondary" onClick={() => dispatch({ type: "redo" })} disabled={hist.future.length === 0}>
          Redo
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            if (!selectedId) return;
            dispatch({ type: "commit", value: deleteKeypoint(keypoints, selectedId) });
            setSelectedId(null);
          }}
          disabled={!selectedId}
        >
          Delete
        </button>
        <button
          type="button"
          className="secondary"
          aria-pressed={!showTrail}
          onClick={onToggleTrail}
        >
          {showTrail ? "Hide glow" : "Show glow"}
        </button>
        <button type="button" className="primary" onClick={addMark}>
          Add mark
        </button>
        <button type="button" className="primary" onClick={() => onExport(keypoints)} disabled={Boolean(videoError)}>
          Export
        </button>
      </div>
      <p className="kbd muted">
        J / K or arrows: 1 frame (Shift: 10) · Space: play/pause · pinch or wheel to zoom · click places a mark on desktop
      </p>
    </main>
  );
}

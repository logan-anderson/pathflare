import { sortKeypoints, type Keypoint } from "../lib/keypoints";

type TimelineProps = {
  frame: number;
  frameCount: number;
  keypoints: Keypoint[];
  selectedId: string | null;
  onFrame: (frame: number) => void;
  onSelect: (id: string) => void;
};

export function Timeline({
  frame,
  frameCount,
  keypoints,
  selectedId,
  onFrame,
  onSelect,
}: TimelineProps) {
  const max = Math.max(1, frameCount - 1);
  return (
    <div className="timeline">
      <div className="transport">
        <span className="transport-frame">
          Frame {frame + 1} / {frameCount}
        </span>
        <div className="transport-buttons">
          <button
            type="button"
            className="frame-step step-back5"
            aria-label="Back 5 frames"
            disabled={frame <= 0}
            onClick={() => onFrame(frame - 5)}
          >
            Back 5 frames
          </button>
          <button
            type="button"
            className="frame-step step-prev"
            aria-label="Previous frame"
            disabled={frame <= 0}
            onClick={() => onFrame(frame - 1)}
          >
            Previous frame
          </button>
          <button
            type="button"
            className="frame-step step-next"
            aria-label="Next frame"
            disabled={frame >= max}
            onClick={() => onFrame(frame + 1)}
          >
            Next frame
          </button>
          <button
            type="button"
            className="frame-step step-fwd5"
            aria-label="Forward 5 frames"
            disabled={frame >= max}
            onClick={() => onFrame(frame + 5)}
          >
            Forward 5 frames
          </button>
        </div>
      </div>
      <div className="timeline-track">
        {sortKeypoints(keypoints).map((kp) => (
          <button
            key={kp.id}
            type="button"
            className={kp.id === selectedId ? "mark-dot on" : "mark-dot"}
            style={{ left: `${(kp.frame / max) * 100}%` }}
            aria-label={`Mark at frame ${kp.frame}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSelect(kp.id);
              onFrame(kp.frame);
            }}
          />
        ))}
        <input
          type="range"
          min={0}
          max={max}
          value={Math.min(frame, max)}
          onChange={(e) => onFrame(Number(e.target.value))}
          aria-label="Playhead"
        />
        <div className="playhead" style={{ left: `${(frame / max) * 100}%` }} />
      </div>
    </div>
  );
}

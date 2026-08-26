import { useEffect, useRef, useState } from "react";
import { Editor } from "./editor/Editor";
import { RECORD_MAX_SEC, WARN_CLIP_SEC, downloadName, formatEta } from "./lib/clipBudget";
import { detectFeatures, HEVC_HELP, isPhone } from "./lib/featureDetect";
import { glowFor, presetById, SPORTS } from "./lib/presets";
import type { Keypoint } from "./lib/keypoints";
import { startBlobDownload } from "./lib/download";
import { DECODE_TIMEOUT, decodeFailureMessage, exportErrorMessage, isDecodeTimeout } from "./lib/timeout";
import type { ProbeInfo, SportId } from "./lib/types";
import { requestWakeLock } from "./lib/wakeLock";
import { createPipelineClient } from "./pipeline/client";
import { pickRecorderMime } from "./pipeline/encode";
import { Logo } from "./ui/Logo";
import "./App.css";

type Step = "home" | "record" | "setup" | "editor" | "export" | "play";

const features = detectFeatures();

export default function App() {
  const clientRef = useRef(createPipelineClient());
  const [step, setStep] = useState<Step>("home");
  const [file, setFile] = useState<File | null>(null);
  const [probe, setProbe] = useState<ProbeInfo | null>(null);
  const [sport, setSport] = useState<SportId>("disc");
  const [customColor, setCustomColor] = useState("#7c5cff");
  const [progress, setProgress] = useState({ frame: 0, total: 1, etaMs: 0 });
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultName, setResultName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [warnAck, setWarnAck] = useState(false);
  const [showTrail, setShowTrail] = useState(true);
  const cancelRef = useRef(false);

  useEffect(() => {
    const client = clientRef.current;
    return () => client.dispose();
  }, []);

  useEffect(() => {
    return () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [resultUrl]);

  const glow = glowFor(sport, customColor);

  async function ingest(next: File) {
    setError(null);
    setBusy(true);
    setWarnAck(false);
    try {
      const info = await clientRef.current.probe(next);
      setFile(next);
      setProbe(info);
      if (!info.canDecode) {
        setError(decodeFailureMessage(info.isHevc, info.codec));
      } else if (info.isHevc) {
        setError(null);
      }
      setStep("setup");
    } catch (err) {
      const message = isDecodeTimeout(err)
        ? HEVC_HELP
        : err instanceof Error
          ? err.message
          : String(err);
      setError(message.includes(DECODE_TIMEOUT) ? HEVC_HELP : message);
    } finally {
      setBusy(false);
    }
  }

  async function runExport(keypoints: Keypoint[]) {
    if (!file || !probe) return;
    cancelRef.current = false;
    setError(null);
    setStep("export");
    setProgress({ frame: 0, total: probe.frameCount, etaMs: 0 });
    const lock = await requestWakeLock();
    try {
      const out = await clientRef.current.exportClip(file, {
        keypoints,
        sport,
        customColor,
        width: probe.processWidth,
        height: probe.processHeight,
        frameCount: probe.frameCount,
        fps: 30,
        rotation: probe.rotation,
        cancelled: () => cancelRef.current,
        onProgress: (f, total, etaMs) => setProgress({ frame: f, total, etaMs }),
      });
      const blob = new Blob([out.buffer], { type: out.mime || "video/mp4" });
      const url = URL.createObjectURL(blob);
      const name = downloadName(sport, blob.type);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      setResultBlob(blob);
      setResultUrl(url);
      setResultName(name);
      startBlobDownload(url, name);
      setStep("play");
    } catch (err) {
      const message = exportErrorMessage(err);
      if (message) setError(message);
      setStep("editor");
    } finally {
      await lock.release();
    }
  }

  function cancelExport() {
    cancelRef.current = true;
    clientRef.current.cancel();
  }

  function reset() {
    cancelExport();
    setFile(null);
    setProbe(null);
    setResultBlob(null);
    setResultName(null);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setResultUrl(null);
    setError(null);
    setStep("home");
  }

  return (
    <div className="app">
      <header className="top">
        <div className="brand" onClick={reset} onKeyDown={(e) => e.key === "Enter" && reset()} role="button" tabIndex={0}>
          <Logo className="brand-mark" />
          <div>
            <strong>Pathflare</strong>
            <div className="privacy">Your video never leaves this device.</div>
          </div>
        </div>
        <div className="mode" title="Decode/encode path">
          {features.pipeline === "webcodecs" ? "WebCodecs" : "Compatibility mode"}
        </div>
      </header>

      {error && (
        <div className="banner danger" role="alert">
          {error}
          <button type="button" className="text-btn" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {step === "home" && <Home busy={busy} onFile={ingest} onRecord={() => setStep("record")} />}
      {step === "record" && (
        <Recorder onCancel={() => setStep("home")} onClip={(clip) => ingest(clip)} />
      )}
      {step === "setup" && probe && (
        <Setup
          probe={probe}
          sport={sport}
          customColor={customColor}
          warnAck={warnAck}
          busy={busy}
          onSport={setSport}
          onColor={setCustomColor}
          onAck={setWarnAck}
          onContinue={() => setStep("editor")}
          onBack={reset}
        />
      )}
      {file && probe && (step === "editor" || step === "export") && (
        <Editor
          file={file}
          probe={probe}
          glow={glow}
          locked={step === "export"}
          showTrail={showTrail}
          onToggleTrail={() => setShowTrail((v) => !v)}
          onBack={() => setStep("setup")}
          onExport={runExport}
        />
      )}
      {step === "export" && (
        <ExportProgress progress={progress} glow={glow} onCancel={cancelExport} />
      )}
      {step === "play" && resultUrl && resultBlob && resultName && (
        <Playback url={resultUrl} blob={resultBlob} name={resultName} onAgain={reset} />
      )}
    </div>
  );
}

function Home({
  busy,
  onFile,
  onRecord,
}: {
  busy: boolean;
  onFile: (file: File) => void;
  onRecord: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  function take(list: FileList | null) {
    const file = list?.[0];
    if (file) onFile(file);
  }

  return (
    <main className="home">
      <p className="lede">Mark the flight, we draw the glow.</p>
      <p className="muted">
        Scrub the clip, place a few marks along the path, and Pathflare interpolates a live glow.
        No account. No watermark. Nothing is uploaded.
      </p>
      <div
        className={`drop ${over ? "over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          take(e.dataTransfer.files);
        }}
      >
        <input ref={inputRef} type="file" accept="video/*" onChange={(e) => take(e.target.files)} />
        <h2>Upload a clip</h2>
        <p>A short throw works best. Tagged in this tab at 720p.</p>
        <button type="button" className="primary" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? "Reading…" : "Choose video"}
        </button>
      </div>
      <button type="button" className="secondary" onClick={onRecord} disabled={busy}>
        Record up to {RECORD_MAX_SEC}s
      </button>
      <ul className="notes">
        <li>Add about 4–10 marks through the flight — release, last tight frame, sky, landing. Two marks make a straight line; three or more make a smooth curve.</li>
        <li>The object does not need to stay visible. Mark the path you mean, even through empty sky.</li>
        <li>iPhone HEVC often needs Safari, or a Most Compatible (H.264) export.</li>
      </ul>
    </main>
  );
}

function Recorder({
  onCancel,
  onClip,
}: {
  onCancel: () => void;
  onClip: (file: File) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [seconds, setSeconds] = useState(0);
  const [live, setLive] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<BlobPart[]>([]);
  const timer = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let gone = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
          },
        });
        if (gone) {
          for (const t of stream.getTracks()) t.stop();
          return;
        }
        streamRef.current = stream;
        setCameraOn(true);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        setErr("Camera permission is required to record.");
      }
    })();
    return () => {
      gone = true;
      stopTracks();
    };
  }, []);

  function stopTracks() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function start() {
    const stream = streamRef.current;
    if (!stream) return;
    chunks.current = [];
    const pick = pickRecorderMime();
    const rec = new MediaRecorder(stream, pick.mime ? { mimeType: pick.mime } : undefined);
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.current.push(e.data);
    };
    rec.onstop = () => {
      const blob = new Blob(chunks.current, { type: rec.mimeType || "video/webm" });
      const ext = blob.type.includes("mp4") ? "mp4" : "webm";
      onClip(new File([blob], `pathflare-record.${ext}`, { type: blob.type }));
      stopTracks();
    };
    recRef.current = rec;
    rec.start(100);
    setLive(true);
    setSeconds(0);
    const t0 = performance.now();
    timer.current = window.setInterval(() => {
      const s = (performance.now() - t0) / 1000;
      setSeconds(s);
      if (s >= RECORD_MAX_SEC) stop();
    }, 80);
  }

  function stop() {
    window.clearInterval(timer.current);
    setLive(false);
    if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
  }

  return (
    <main className="record">
      <video ref={videoRef} playsInline muted autoPlay />
      <div className="record-bar">
        <span className={live ? "rec-dot on" : "rec-dot"} />
        <strong>
          {Math.min(RECORD_MAX_SEC, seconds).toFixed(1)}s / {RECORD_MAX_SEC}s
        </strong>
        {err && <span className="muted">{err}</span>}
        <div className="row">
          {!live ? (
            <button type="button" className="primary" onClick={start} disabled={!cameraOn}>
              Start
            </button>
          ) : (
            <button type="button" className="primary" onClick={stop}>
              Stop
            </button>
          )}
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </main>
  );
}

function Setup({
  probe,
  sport,
  customColor,
  warnAck,
  busy,
  onSport,
  onColor,
  onAck,
  onContinue,
  onBack,
}: {
  probe: ProbeInfo;
  sport: SportId;
  customColor: string;
  warnAck: boolean;
  busy: boolean;
  onSport: (id: SportId) => void;
  onColor: (c: string) => void;
  onAck: (v: boolean) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  const needsWarn = probe.overPhoneBudget || (isPhone() && (probe.is4k || probe.durationSec > 15));
  const blocked = (needsWarn && !warnAck) || (!probe.canDecode && probe.isHevc === false);
  return (
    <main className="setup">
      <h2>Glow color</h2>
      <div className="presets">
        {SPORTS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={sport === p.id ? "preset on" : "preset"}
            onClick={() => onSport(p.id)}
            style={{ ["--glow" as string]: p.glow }}
          >
            <span className="swatch" />
            {p.label}
          </button>
        ))}
      </div>
      {sport === "custom" && (
        <label className="color">
          Trail color
          <input type="color" value={customColor} onChange={(e) => onColor(e.target.value)} />
        </label>
      )}
      <p className="muted">{presetById(sport).hint}</p>
      {probe.isHevc && (
        <p className="banner warn" role="status">
          {probe.canDecode
            ? "HEVC clip detected. If playback fails, use Safari or re-export as Most Compatible (H.264)."
            : HEVC_HELP}
        </p>
      )}
      {probe.overDuration && (
        <p className="banner warn">
          This clip is longer than {WARN_CLIP_SEC}s ({probe.durationSec.toFixed(1)}s, {probe.frameCount} frames).
          Pathflare will still mark and export it, processed at 720p.
        </p>
      )}
      {probe.is1080 && !probe.is4k && (
        <p className="banner warn">1080p is processed at 720p. Full ImageData at camera resolution is never allocated.</p>
      )}
      {probe.is4k && (
        <p className="banner warn">4K is downscaled immediately to 720p. 4K ImageData is never allocated.</p>
      )}
      {needsWarn && (
        <label className="ack">
          <input type="checkbox" checked={warnAck} onChange={(e) => onAck(e.target.checked)} />
          This phone clip is longer than 15s or 4K. Processing may be slow or memory-heavy. Continue anyway.
        </label>
      )}
      <div className="row">
        <button type="button" className="secondary" onClick={onBack}>
          Back
        </button>
        <button type="button" className="primary" disabled={blocked || busy} onClick={onContinue}>
          Mark path
        </button>
      </div>
    </main>
  );
}

function ExportProgress({
  progress,
  glow,
  onCancel,
}: {
  progress: { frame: number; total: number; etaMs: number };
  glow: string;
  onCancel: () => void;
}) {
  const pct = Math.round((progress.frame / Math.max(1, progress.total)) * 100);
  return (
    <div className="export-overlay" role="dialog" aria-modal="true" aria-labelledby="export-title">
      <main className="run">
        <h2 id="export-title">Export</h2>
        <p className="muted">
          {progress.frame === 0
            ? "Starting encoder…"
            : "Baking the glow. Your marks stay on the clip if you cancel."}
        </p>
        <p className="eta">
          Frame {progress.frame} / {progress.total} · ETA {formatEta(progress.etaMs)}
        </p>
        <div className="bar">
          <i style={{ width: `${pct}%`, background: glow }} />
        </div>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </main>
    </div>
  );
}

function Playback({
  url,
  blob,
  name,
  onAgain,
}: {
  url: string;
  blob: Blob;
  name: string;
  onAgain: () => void;
}) {
  function download() {
    startBlobDownload(url, name);
  }
  return (
    <main className="play">
      <h2>Clip ready</h2>
      <p className="muted">
        A download of {name} should start automatically. If it didn’t, tap Download.
      </p>
      <video src={url} controls playsInline />
      <div className="row">
        <button type="button" className="primary" onClick={download}>
          Download {name}
        </button>
        <button type="button" className="secondary" onClick={onAgain}>
          New clip
        </button>
      </div>
      <p className="privacy">Your video never leaves this device. File size {(blob.size / 1e6).toFixed(1)} MB.</p>
    </main>
  );
}

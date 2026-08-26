import { useEffect, useMemo, useRef, useState } from "react";
import { downloadName, formatEta, MAX_CLIP_SEC } from "./lib/clipBudget";
import { detectFeatures, HEVC_HELP, isPhone } from "./lib/featureDetect";
import { glowFor, presetById, SPORTS } from "./lib/presets";
import type { ProbeInfo, SportId } from "./lib/types";
import { requestWakeLock } from "./lib/wakeLock";
import { createPipelineClient } from "./pipeline/client";
import { pickRecorderMime } from "./pipeline/encode";
import { Logo } from "./ui/Logo";
import "./App.css";

type Step = "home" | "record" | "setup" | "tap" | "run" | "play";

const features = detectFeatures();

export default function App() {
  const clientRef = useRef(createPipelineClient());
  const [step, setStep] = useState<Step>("home");
  const [file, setFile] = useState<File | null>(null);
  const [probe, setProbe] = useState<ProbeInfo | null>(null);
  const [sport, setSport] = useState<SportId>("disc");
  const [customColor, setCustomColor] = useState("#7c5cff");
  const [frame, setFrame] = useState<ImageBitmap | null>(null);
  const [frameSize, setFrameSize] = useState({ width: 1280, height: 720 });
  const [seed, setSeed] = useState<{ x: number; y: number } | null>(null);
  const [progress, setProgress] = useState({ frame: 0, total: 1, etaMs: 0 });
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [retap, setRetap] = useState(false);
  const [warnAck, setWarnAck] = useState(false);
  const cancelRef = useRef(false);
  const retapResolver = useRef<((p: { x: number; y: number } | null) => void) | null>(null);

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
  const preset = presetById(sport);

  async function ingest(next: File) {
    setError(null);
    setBusy(true);
    setWarnAck(false);
    setSeed(null);
    try {
      const info = await clientRef.current.probe(next);
      setFile(next);
      setProbe(info);
      if (!info.canDecode) {
        setError(
          info.isHevc
            ? HEVC_HELP
            : `This browser cannot decode ${info.codec ?? "this"} video.`,
        );
      }
      setStep("setup");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function loadFirstFrame() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const result = await clientRef.current.firstFrame(file);
      setFrame(result.bitmap);
      setFrameSize({ width: result.width, height: result.height });
      setProbe(result.probe);
      setStep("tap");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function run(nextSeed: { x: number; y: number }) {
    if (!file) return;
    cancelRef.current = false;
    setSeed(nextSeed);
    setStep("run");
    setRetap(false);
    setProgress({ frame: 0, total: probe?.frameCount ?? 1, etaMs: 0 });
    const lock = await requestWakeLock();
    try {
      const out = await clientRef.current.process(file, {
        sport,
        customColor,
        seed: nextSeed,
        cancelled: () => cancelRef.current,
        onProgress: (f, total, etaMs) => setProgress({ frame: f, total, etaMs }),
        onNeedRetap: (bitmap, width, height) => {
          frame?.close();
          setFrame(bitmap);
          setFrameSize({ width, height });
          setRetap(true);
          return new Promise((resolve) => {
            retapResolver.current = resolve;
          });
        },
      });
      const blob = new Blob([out.buffer], { type: out.mime || "video/mp4" });
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      setResultBlob(blob);
      setResultUrl(URL.createObjectURL(blob));
      setStep("play");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message !== "Canceled") setError(message);
      else setStep("tap");
    } finally {
      await lock.release();
    }
  }

  function cancelRun() {
    cancelRef.current = true;
    retapResolver.current?.(null);
    retapResolver.current = null;
    clientRef.current.cancel();
  }

  function reset() {
    cancelRun();
    setFile(null);
    setProbe(null);
    setFrame(null);
    setSeed(null);
    setResultBlob(null);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setResultUrl(null);
    setError(null);
    setStep("home");
  }

  return (
    <div className="app">
      <header className="top">
        <div className="brand" onClick={reset} role="button" tabIndex={0}>
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
          <button className="text-btn" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {step === "home" && (
        <Home busy={busy} onFile={ingest} onRecord={() => setStep("record")} />
      )}
      {step === "record" && (
        <Recorder
          onCancel={() => setStep("home")}
          onClip={(clip) => ingest(clip)}
        />
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
          onContinue={loadFirstFrame}
          onBack={reset}
        />
      )}
      {step === "tap" && frame && (
        <Tap
          bitmap={frame}
          width={frameSize.width}
          height={frameSize.height}
          sport={sport}
          glow={glow}
          hint={preset.hint}
          seed={seed}
          onSeed={(p) => setSeed(p)}
          onRun={() => seed && run(seed)}
          onBack={() => setStep("setup")}
        />
      )}
      {step === "run" && (
        <ProgressView
          progress={progress}
          retap={retap}
          bitmap={frame}
          width={frameSize.width}
          height={frameSize.height}
          glow={glow}
          onCancel={cancelRun}
          onRetap={(p) => {
            setRetap(false);
            setSeed(p);
            retapResolver.current?.(p);
            retapResolver.current = null;
          }}
        />
      )}
      {step === "play" && resultUrl && resultBlob && (
        <Playback
          url={resultUrl}
          blob={resultBlob}
          sport={sport}
          onAgain={reset}
        />
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
      <p className="lede">
        Overlay a glow trail on one flying object in a short clip. Tap to seed.
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
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          onChange={(e) => take(e.target.files)}
        />
        <h2>Upload a clip</h2>
        <p>Drop a 5–10s throw or hit. Processed at 720p30 in this tab.</p>
        <button className="primary" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? "Reading…" : "Choose video"}
        </button>
      </div>
      <button className="secondary" onClick={onRecord} disabled={busy}>
        Record up to {MAX_CLIP_SEC}s
      </button>
      <ul className="notes">
        <li>Tracks one object you tap. It will not invent a trail if lock is lost — re-tap instead.</li>
        <li>Golf is a stretch: use a close, well-lit shot.</li>
        <li>This is a browser demo, not a stadium tracking system.</li>
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
      if (s >= MAX_CLIP_SEC) stop();
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
        <strong>{Math.min(MAX_CLIP_SEC, seconds).toFixed(1)}s / {MAX_CLIP_SEC}s</strong>
        {err && <span className="muted">{err}</span>}
        <div className="row">
          {!live ? (
            <button className="primary" onClick={start} disabled={!cameraOn}>
              Start
            </button>
          ) : (
            <button className="primary" onClick={stop}>
              Stop
            </button>
          )}
          <button className="secondary" onClick={onCancel}>
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
  const blocked = needsWarn && !warnAck;
  return (
    <main className="setup">
      <h2>Sport preset</h2>
      <div className="presets">
        {SPORTS.map((p) => (
          <button
            key={p.id}
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
      {probe.overDuration && (
        <p className="banner warn">Only the first {MAX_CLIP_SEC}s will be processed.</p>
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
      {!probe.canDecode && probe.isHevc && <p className="banner danger">{HEVC_HELP}</p>}
      <div className="row">
        <button className="secondary" onClick={onBack}>
          Back
        </button>
        <button className="primary" disabled={blocked || busy || !probe.canDecode} onClick={onContinue}>
          {busy ? "Decoding first frame…" : "Tap the object"}
        </button>
      </div>
    </main>
  );
}

function Tap({
  bitmap,
  width,
  height,
  sport,
  glow,
  hint,
  seed,
  onSeed,
  onRun,
  onBack,
}: {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  sport: SportId;
  glow: string;
  hint: string;
  seed: { x: number; y: number } | null;
  onSeed: (p: { x: number; y: number }) => void;
  onRun: () => void;
  onBack: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(bitmap, 0, 0, width, height);
    if (seed) {
      ctx.beginPath();
      ctx.strokeStyle = glow;
      ctx.lineWidth = 3;
      ctx.arc(seed.x, seed.y, 18, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, [bitmap, width, height, seed, glow]);

  function pointFromEvent(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * width,
      y: ((e.clientY - rect.top) / rect.height) * height,
    };
  }

  return (
    <main className="tap">
      <h2>Tap the object on frame 0</h2>
      <p className="muted">{hint}</p>
      <canvas
        ref={canvasRef}
        onPointerDown={(e) => {
          e.preventDefault();
          onSeed(pointFromEvent(e));
        }}
      />
      <div className="row">
        <button className="secondary" onClick={onBack}>
          Back
        </button>
        <button className="primary" disabled={!seed} onClick={onRun}>
          Track {sport === "golf" ? "golf ball" : sport}
        </button>
      </div>
    </main>
  );
}

function ProgressView({
  progress,
  retap,
  bitmap,
  width,
  height,
  glow,
  onCancel,
  onRetap,
}: {
  progress: { frame: number; total: number; etaMs: number };
  retap: boolean;
  bitmap: ImageBitmap | null;
  width: number;
  height: number;
  glow: string;
  onCancel: () => void;
  onRetap: (p: { x: number; y: number }) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!retap || !bitmap || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(bitmap, 0, 0, width, height);
  }, [retap, bitmap, width, height]);

  const pct = Math.round((progress.frame / Math.max(1, progress.total)) * 100);

  return (
    <main className="run">
      {retap ? (
        <>
          <h2>We lost the object. Tap it again.</h2>
          <p className="muted">Pathflare never invents a trail through a gap.</p>
          <canvas
            ref={canvasRef}
            onPointerDown={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              onRetap({
                x: ((e.clientX - rect.left) / rect.width) * width,
                y: ((e.clientY - rect.top) / rect.height) * height,
              });
            }}
          />
        </>
      ) : (
        <>
          <h2>Tracking</h2>
          <p className="eta">
            Frame {progress.frame} / {progress.total} · ETA {formatEta(progress.etaMs)}
          </p>
          <div className="bar">
            <i style={{ width: `${pct}%`, background: glow }} />
          </div>
        </>
      )}
      <button className="secondary" onClick={onCancel}>
        Cancel
      </button>
    </main>
  );
}

function Playback({
  url,
  blob,
  sport,
  onAgain,
}: {
  url: string;
  blob: Blob;
  sport: SportId;
  onAgain: () => void;
}) {
  const name = useMemo(() => downloadName(sport, blob.type), [sport, blob.type]);
  function download() {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
  }
  return (
    <main className="play">
      <h2>Playback</h2>
      <video src={url} controls playsInline />
      <div className="row">
        <button className="primary" onClick={download}>
          Download {name}
        </button>
        <button className="secondary" onClick={onAgain}>
          New clip
        </button>
      </div>
      <p className="privacy">Your video never leaves this device.</p>
    </main>
  );
}

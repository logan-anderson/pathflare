import {
  BufferTarget,
  CanvasSource,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  Mp4OutputFormat,
  Output,
  canEncodeVideo,
  getFirstEncodableVideoCodec,
  QUALITY_HIGH,
  type InputAudioTrack,
  type VideoEncodingConfig,
} from "mediabunny";
import { withTimeout } from "../lib/timeout";
import { clampDuration, clampPacketTiming, clampTimestamp, isNegativeTimestampError } from "../lib/timestamps";

export const ENCODER_UNSUPPORTED = "ENCODER_UNSUPPORTED";
const TARGET_BITRATE = 8_000_000;

export type EncoderSession = {
  width: number;
  height: number;
  addFrame: (
    canvas: OffscreenCanvas | HTMLCanvasElement,
    timestamp: number,
    duration: number,
  ) => Promise<void>;
  finalize: () => Promise<Blob>;
  cancel: () => Promise<void>;
};

export async function createMp4Encoder(opts: {
  width: number;
  height: number;
  audioTrack?: InputAudioTrack | null;
}): Promise<EncoderSession> {
  try {
    return await openMp4Encoder(opts);
  } catch (err) {
    if (opts.audioTrack && isNegativeTimestampError(err)) {
      return openMp4Encoder({ ...opts, audioTrack: null });
    }
    throw err;
  }
}

async function openMp4Encoder(opts: {
  width: number;
  height: number;
  audioTrack?: InputAudioTrack | null;
}): Promise<EncoderSession> {
  const encoding = await pickAvcEncoding(opts.width, opts.height);
  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target,
  });

  const canvas = new OffscreenCanvas(opts.width, opts.height);
  const videoSource = new CanvasSource(canvas, encoding);
  output.addVideoTrack(videoSource, { frameRate: 30 });

  let audioSource: EncodedAudioPacketSource | null = null;
  if (opts.audioTrack) {
    try {
      audioSource = await attachAudioCopy(output, opts.audioTrack);
    } catch {
      audioSource = null;
    }
  }

  await withTimeout(output.start(), 12_000, `${ENCODER_UNSUPPORTED}: encoder start timed out`);

  try {
    if (audioSource && opts.audioTrack) {
      await withTimeout(
        copyAudioPackets(audioSource, opts.audioTrack),
        12_000,
        `${ENCODER_UNSUPPORTED}: audio copy timed out`,
      );
    }
  } catch (err) {
    if (output.state === "started" || output.state === "pending") {
      await output.cancel().catch(() => undefined);
    }
    throw err;
  }

  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("OffscreenCanvas 2D is unavailable.");

  return {
    width: opts.width,
    height: opts.height,
    addFrame: async (src, timestamp, duration) => {
      ctx.drawImage(src, 0, 0, opts.width, opts.height);
      const ts = clampTimestamp(timestamp);
      const dur = clampDuration(duration, 1 / 30);
      await withTimeout(
        videoSource.add(ts, dur),
        12_000,
        `${ENCODER_UNSUPPORTED}: frame encode timed out`,
      );
    },
    finalize: async () => {
      await withTimeout(output.finalize(), 20_000, `${ENCODER_UNSUPPORTED}: finalize timed out`);
      const buffer = target.buffer;
      if (!buffer) throw new Error("Encoder produced an empty file.");
      return new Blob([buffer], { type: "video/mp4" });
    },
    cancel: async () => {
      if (output.state === "started" || output.state === "pending") {
        await output.cancel();
      }
    },
  };
}

async function pickAvcEncoding(width: number, height: number): Promise<VideoEncodingConfig> {
  const hardware = await probeExactAvc(width, height, "prefer-hardware");
  if (hardware) {
    return {
      codec: "avc",
      bitrate: TARGET_BITRATE,
      hardwareAcceleration: "prefer-hardware",
      fullCodecString: hardware,
      keyFrameInterval: 2,
      bitrateMode: "variable",
    };
  }

  const software = await probeExactAvc(width, height, "prefer-software");
  if (software) {
    return {
      codec: "avc",
      bitrate: TARGET_BITRATE,
      hardwareAcceleration: "prefer-software",
      fullCodecString: software,
      keyFrameInterval: 2,
      bitrateMode: "variable",
    };
  }

  const ok = await canEncodeVideo("avc", {
    width,
    height,
    quality: QUALITY_HIGH,
  });
  const codec = ok
    ? "avc"
    : await getFirstEncodableVideoCodec(["avc"], { width, height, quality: QUALITY_HIGH });
  if (!codec) {
    throw new Error(ENCODER_UNSUPPORTED);
  }
  return {
    codec,
    quality: QUALITY_HIGH,
    hardwareAcceleration: "no-preference",
    keyFrameInterval: 2,
  };
}

async function probeExactAvc(
  width: number,
  height: number,
  hardwareAcceleration: VideoEncoderConfig["hardwareAcceleration"],
): Promise<string | null> {
  if (typeof VideoEncoder === "undefined") return null;
  const candidates = ["avc1.4d401f", "avc1.4d401e", "avc1.42001e"];
  for (const codec of candidates) {
    try {
      const result = await VideoEncoder.isConfigSupported({
        codec,
        width,
        height,
        bitrate: TARGET_BITRATE,
        framerate: 30,
        hardwareAcceleration,
      });
      if (result.supported) return codec;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function attachAudioCopy(
  output: Output,
  audioTrack: InputAudioTrack,
): Promise<EncodedAudioPacketSource | null> {
  const codec = await audioTrack.getCodec();
  if (!codec) return null;
  const supported = new Mp4OutputFormat().getSupportedAudioCodecs();
  if (!supported.includes(codec)) return null;
  const source = new EncodedAudioPacketSource(codec);
  output.addAudioTrack(source);
  return source;
}

async function copyAudioPackets(
  source: EncodedAudioPacketSource,
  audioTrack: InputAudioTrack,
): Promise<void> {
  const sink = new EncodedPacketSink(audioTrack);
  const decoderConfig = await audioTrack.getDecoderConfig();
  let first = true;
  for await (const packet of sink.packets()) {
    const timing = clampPacketTiming(packet.timestamp, packet.duration);
    if (!timing) continue;
    const toAdd =
      timing.timestamp === packet.timestamp && timing.duration === packet.duration
        ? packet
        : packet.clone({ timestamp: timing.timestamp, duration: timing.duration });
    await source.add(toAdd, first && decoderConfig ? { decoderConfig } : undefined);
    first = false;
  }
}

export function pickRecorderMime(): { mime: string; ext: "mp4" | "webm" } {
  const candidates = [
    "video/mp4;codecs=avc1.4d401f",
    "video/mp4;codecs=avc1.42001E",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  if (typeof MediaRecorder === "undefined") {
    return { mime: "video/webm", ext: "webm" };
  }
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) {
      return { mime, ext: mime.includes("mp4") ? "mp4" : "webm" };
    }
  }
  return { mime: "", ext: "webm" };
}

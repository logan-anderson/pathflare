import {
  BufferTarget,
  CanvasSource,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  Mp4OutputFormat,
  Output,
  type InputAudioTrack,
} from "mediabunny";

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
  const probed = await probeAvcConfig(opts.width, opts.height);
  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target,
  });

  const canvas = new OffscreenCanvas(opts.width, opts.height);
  const videoSource = new CanvasSource(canvas, {
    codec: "avc",
    bitrate: probed.bitrate,
    hardwareAcceleration: "prefer-hardware",
    fullCodecString: probed.fullCodecString,
    keyFrameInterval: 2,
    bitrateMode: "variable",
  });
  output.addVideoTrack(videoSource, { frameRate: 30 });

  let audioSource: EncodedAudioPacketSource | null = null;
  if (opts.audioTrack) {
    try {
      audioSource = await attachAudioCopy(output, opts.audioTrack);
    } catch {
      audioSource = null;
    }
  }

  await output.start();

  if (audioSource && opts.audioTrack) {
    try {
      await copyAudioPackets(audioSource, opts.audioTrack);
    } catch {
      /* video-only if copy fails */
    }
  }

  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("OffscreenCanvas 2D is unavailable.");

  return {
    width: opts.width,
    height: opts.height,
    addFrame: async (src, timestamp, duration) => {
      ctx.drawImage(src, 0, 0, opts.width, opts.height);
      await videoSource.add(timestamp, duration);
    },
    finalize: async () => {
      await output.finalize();
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

async function probeAvcConfig(
  width: number,
  height: number,
): Promise<{ bitrate: number; fullCodecString?: string }> {
  if (typeof VideoEncoder === "undefined") {
    return { bitrate: TARGET_BITRATE, fullCodecString: "avc1.4d401f" };
  }
  const candidates = ["avc1.4d401f", "avc1.4d401e", "avc1.42001e"];
  for (const codec of candidates) {
    try {
      const result = await VideoEncoder.isConfigSupported({
        codec,
        width,
        height,
        bitrate: TARGET_BITRATE,
        framerate: 30,
        hardwareAcceleration: "prefer-hardware",
        avc: { format: "avc" },
      });
      if (result.supported) {
        return { bitrate: TARGET_BITRATE, fullCodecString: codec };
      }
    } catch {
      /* try next */
    }
  }
  return { bitrate: TARGET_BITRATE };
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
    await source.add(packet, first && decoderConfig ? { decoderConfig } : undefined);
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

import {
  BlobSource,
  Input,
  MATROSKA,
  MP4,
  QTFF,
  VideoSampleSink,
  WEBM,
  type InputVideoTrack,
} from "mediabunny";
import {
  fitProcessSize,
  is4kSize,
  MAX_CLIP_SEC,
  PHONE_WARN_SEC,
  TARGET_FPS,
} from "../lib/clipBudget";
import { HEVC_HELP, isPhone } from "../lib/featureDetect";
import type { ProbeInfo } from "../lib/types";

export async function openInput(file: Blob): Promise<Input> {
  return new Input({
    source: new BlobSource(file),
    formats: [MP4, QTFF, WEBM, MATROSKA],
  });
}

export function disposeInput(input: Input): void {
  try {
    input.dispose();
  } catch {
    /* ignore */
  }
}

export async function probeFile(file: Blob): Promise<ProbeInfo> {
  const input = await openInput(file);
  try {
    return await probeInput(input);
  } finally {
    disposeInput(input);
  }
}

export async function probeInput(input: Input): Promise<ProbeInfo> {
  const videoTrack = await input.getPrimaryVideoTrack();
  if (!videoTrack) {
    throw new Error("No video track found in this file.");
  }
  const audioTrack = await input.getPrimaryAudioTrack();
  const codedWidth = await videoTrack.getCodedWidth();
  const codedHeight = await videoTrack.getCodedHeight();
  const displayWidth = await videoTrack.getDisplayWidth();
  const displayHeight = await videoTrack.getDisplayHeight();
  const rotation = await videoTrack.getRotation();
  const codec = await videoTrack.getCodec();
  const codecString = await videoTrack.getCodecParameterString();
  const canDecode = await videoTrack.canDecode();
  const durationSec = await videoDuration(videoTrack);
  const process = fitProcessSize(displayWidth, displayHeight);
  const isHevc =
    codec === "hevc" ||
    (codecString ?? "").toLowerCase().includes("hvc1") ||
    (codecString ?? "").toLowerCase().includes("hev1");
  const frameCount = Math.max(1, Math.round(Math.min(durationSec, MAX_CLIP_SEC) * TARGET_FPS));

  return {
    durationSec,
    codedWidth,
    codedHeight,
    displayWidth,
    displayHeight,
    processWidth: process.width,
    processHeight: process.height,
    codec,
    codecString,
    canDecode,
    isHevc,
    is4k: is4kSize(codedWidth, codedHeight) || is4kSize(displayWidth, displayHeight),
    overDuration: durationSec > MAX_CLIP_SEC + 0.15,
    overPhoneBudget: isPhone() && (durationSec > PHONE_WARN_SEC || is4kSize(codedWidth, codedHeight)),
    rotation,
    hasAudio: Boolean(audioTrack),
    frameCount,
  };
}

export function hevcMessage(info: ProbeInfo): string | null {
  if (!info.isHevc || info.canDecode) return null;
  return HEVC_HELP;
}

export async function videoDuration(track: InputVideoTrack): Promise<number> {
  const fromMeta = await track.computeDuration();
  if (Number.isFinite(fromMeta) && fromMeta > 0) return fromMeta;
  return 0;
}

export async function firstSampleBitmap(file: Blob): Promise<{
  bitmap: ImageBitmap;
  width: number;
  height: number;
  probe: ProbeInfo;
}> {
  const input = await openInput(file);
  try {
    const probe = await probeInput(input);
    if (!probe.canDecode) {
      throw new Error(probe.isHevc ? HEVC_HELP : `This browser cannot decode ${probe.codec ?? "this"} video.`);
    }
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) throw new Error("No video track found in this file.");
    const sink = new VideoSampleSink(videoTrack);
    const sample = await sink.getSample(0);
    if (!sample) throw new Error("Could not read the first frame.");
    try {
      const canvas = new OffscreenCanvas(probe.processWidth, probe.processHeight);
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("OffscreenCanvas 2D is unavailable.");
      sample.draw(ctx, 0, 0, probe.processWidth, probe.processHeight);
      const bitmap = canvas.transferToImageBitmap();
      return { bitmap, width: probe.processWidth, height: probe.processHeight, probe };
    } finally {
      sample.close();
    }
  } finally {
    disposeInput(input);
  }
}

export function assertNot4kImageData(width: number, height: number): void {
  if (is4kSize(width, height)) {
    throw new Error("Refusing to allocate 4K ImageData. Downscale to 720p first.");
  }
}

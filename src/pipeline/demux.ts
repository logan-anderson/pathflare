import {
  BlobSource,
  Input,
  MATROSKA,
  MP4,
  QTFF,
  WEBM,
  type InputVideoTrack,
} from "mediabunny";
import {
  fitProcessSize,
  frameCountFor,
  is1080Size,
  is4kSize,
  PHONE_WARN_SEC,
  WARN_CLIP_SEC,
} from "../lib/clipBudget";
import { isPhone } from "../lib/featureDetect";
import { normalizeRotation } from "../lib/rotation";
import {
  DECODE_TIMEOUT,
  DECODE_TIMEOUT_MS,
  isHevcCodec,
  withTimeout,
} from "../lib/timeout";
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
  const rotation = normalizeRotation(await videoTrack.getRotation());
  const codec = await videoTrack.getCodec();
  const codecString = await videoTrack.getCodecParameterString();
  const isHevc = isHevcCodec(codec, codecString);
  let canDecode = false;
  try {
    canDecode = await withTimeout(videoTrack.canDecode(), DECODE_TIMEOUT_MS, DECODE_TIMEOUT);
  } catch {
    canDecode = false;
  }
  const durationSec = await videoDuration(videoTrack);
  const process = fitProcessSize(displayWidth, displayHeight);
  const fourK = is4kSize(codedWidth, codedHeight) || is4kSize(displayWidth, displayHeight);

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
    is4k: fourK,
    is1080: is1080Size(displayWidth, displayHeight) || is1080Size(codedWidth, codedHeight),
    overDuration: durationSec > WARN_CLIP_SEC + 0.15,
    overPhoneBudget: isPhone() && (durationSec > PHONE_WARN_SEC || fourK),
    rotation,
    hasAudio: Boolean(audioTrack),
    frameCount: frameCountFor(durationSec),
  };
}

export async function videoDuration(track: InputVideoTrack): Promise<number> {
  const fromMeta = await track.computeDuration();
  if (Number.isFinite(fromMeta) && fromMeta > 0) return fromMeta;
  return 0;
}

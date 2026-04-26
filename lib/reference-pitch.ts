/**
 * Reference-pitch extraction for parasha lead mode.
 *
 * Loads the cantor's mp3, decodes it, and produces a per-word pitch contour
 * (in semitones, normalized to the cantor's median pitch). These contours are
 * the *real* targets that the student's singing is scored against — replacing
 * the hand-authored trope motifs we shipped first.
 *
 * Design choices:
 * - Decode at 16 kHz mono via OfflineAudioContext. YIN is O(N²) per window,
 *   so working at 16 kHz roughly quarters the work versus 44.1 kHz. Speech f0
 *   tops out around 400 Hz, so 16 kHz Nyquist (8 kHz) is overkill and safe.
 * - First pass: estimate the cantor's tonic as the median of all voiced
 *   semitone samples across the aliya. This is the "0" reference for that
 *   recording. Stored in the result so the UI can also use it.
 * - Second pass: for each word, run YIN at N evenly-spaced positions inside
 *   [word.start, word.end]. Subtract tonic. Smooth with a 3-tap median filter
 *   to dampen YIN's occasional octave errors.
 * - We yield to the event loop between every few words so a long aliya
 *   doesn't freeze the page.
 */

import { detectPitchYIN, hzToSemitones, median } from "@/lib/pitch";
import type { AliyaData, ParashaWord } from "@/lib/parasha-types";

/** Reference data for one aliya. */
export type ReferenceContours = {
  /** Global tonic of this recording, in semitones above A1 (55 Hz). */
  tonic: number;
  /** Per-word contour, semitones above/below tonic. NaN where unvoiced. */
  contours: Map<number, number[]>;
  /** Sampling resolution per word (each contour has this length). */
  framesPerWord: number;
};

/** Optional progress callback while extraction runs. */
export type ExtractProgress = (done: number, total: number) => void;

const TARGET_SR = 16_000;
/** Analysis frame size in samples at TARGET_SR. ~64 ms — enough for f0 ≥ 50 Hz. */
const FRAME = 1024;
/** Hop between frames in the global tonic pass. */
const GLOBAL_HOP = 512;
/** Per-word contour resolution. Matches the engine's scoringFrames. */
const FRAMES_PER_WORD = 20;
/** Acceptable f0 range for voice. */
const MIN_HZ = 70;
const MAX_HZ = 500;

/** 3-tap median filter — wipes single-frame YIN octave errors. */
function median3(arr: number[]): number[] {
  const out = arr.slice();
  for (let i = 1; i < arr.length - 1; i++) {
    const a = arr[i - 1];
    const b = arr[i];
    const c = arr[i + 1];
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) {
      out[i] = b; // can't median with NaNs — pass through
      continue;
    }
    out[i] = a < b ? (b < c ? b : a < c ? c : a) : a < c ? a : b < c ? c : b;
  }
  return out;
}

/** Decode an mp3 ArrayBuffer to a 16 kHz mono Float32Array. */
async function decodeMonoAt16k(arrayBuffer: ArrayBuffer): Promise<Float32Array> {
  type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };
  const Ctx =
    window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
  if (!Ctx) throw new Error("Web Audio API not available.");

  // We need duration first to size the OfflineAudioContext, so do a regular
  // decode pass and then a render pass that resamples + downmixes to mono.
  const tempCtx = new Ctx();
  // decodeAudioData mutates the buffer in some browsers; clone defensively.
  const decoded = await tempCtx.decodeAudioData(arrayBuffer.slice(0));
  await tempCtx.close();

  const offlineCtx = new OfflineAudioContext(
    1,
    Math.max(1, Math.ceil(decoded.duration * TARGET_SR)),
    TARGET_SR,
  );
  const src = offlineCtx.createBufferSource();
  src.buffer = decoded;
  src.connect(offlineCtx.destination);
  src.start();
  const rendered = await offlineCtx.startRendering();
  return rendered.getChannelData(0).slice();
}

function flattenWords(aliya: AliyaData): ParashaWord[] {
  const out: ParashaWord[] = [];
  for (const v of aliya.verses) for (const w of v.words) out.push(w);
  return out;
}

/**
 * Run YIN at the given start sample and return semitones, or NaN if no
 * confident pitch could be detected.
 */
function f0SemitonesAt(
  samples: Float32Array,
  startSample: number,
): number {
  const n = FRAME;
  if (startSample < 0 || startSample + n > samples.length) return NaN;
  const buf = samples.subarray(startSample, startSample + n);
  // Cheap silence guard: if energy is very low, skip YIN.
  let energy = 0;
  for (let i = 0; i < buf.length; i++) energy += buf[i] * buf[i];
  if (energy / buf.length < 1e-5) return NaN;
  // YIN needs an isolated buffer (it doesn't support strided / shared buffers
  // in some TS lib configs); copy to a fresh ArrayBuffer-backed Float32Array.
  const fresh = new Float32Array(n);
  fresh.set(buf);
  const f0 = detectPitchYIN(fresh, TARGET_SR);
  if (f0 == null || f0 < MIN_HZ || f0 > MAX_HZ) return NaN;
  return hzToSemitones(f0);
}

/** Sleep helper for yielding to the UI thread between batches. */
function nextTick(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

/**
 * Main entry: extract reference contours for an aliya. Caller should cache the
 * result, since extraction takes a few seconds for a 1-minute clip.
 */
export async function extractReferenceContours(
  audioUrl: string,
  aliya: AliyaData,
  onProgress?: ExtractProgress,
): Promise<ReferenceContours> {
  const res = await fetch(audioUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch reference audio (${res.status}).`);
  }
  const arrayBuffer = await res.arrayBuffer();
  const samples = await decodeMonoAt16k(arrayBuffer);

  // First pass: cantor's tonic = median of all voiced semitones.
  const globalSemitones: number[] = [];
  for (let pos = 0; pos + FRAME <= samples.length; pos += GLOBAL_HOP) {
    const semi = f0SemitonesAt(samples, pos);
    if (Number.isFinite(semi)) globalSemitones.push(semi);
  }
  const tonic = median(globalSemitones) ?? 0;

  // Second pass: per-word contour, normalized + smoothed.
  const flat = flattenWords(aliya);
  const contours = new Map<number, number[]>();
  for (let i = 0; i < flat.length; i++) {
    const w = flat[i];
    const startSamp = Math.floor(w.start * TARGET_SR);
    const endSamp = Math.floor(w.end * TARGET_SR);
    const span = Math.max(FRAME, endSamp - startSamp);
    const raw = new Array<number>(FRAMES_PER_WORD).fill(NaN);
    const denom = Math.max(1, FRAMES_PER_WORD - 1);
    for (let k = 0; k < FRAMES_PER_WORD; k++) {
      // Center of the k-th frame, evenly spaced inside the word.
      const frac = k / denom;
      const center = startSamp + Math.floor(span * frac);
      const winStart = Math.max(0, center - FRAME / 2);
      const semi = f0SemitonesAt(samples, winStart);
      raw[k] = Number.isFinite(semi) ? semi - tonic : NaN;
    }
    contours.set(i, median3(raw));
    onProgress?.(i + 1, flat.length);
    // Yield every few words to keep the page responsive.
    if (i % 4 === 3) await nextTick();
  }

  return { tonic, contours, framesPerWord: FRAMES_PER_WORD };
}

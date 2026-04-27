/**
 * Microphone pitch capture + scoring helpers for lead-mode karaoke.
 *
 * Uses an inline YIN-style fundamental-frequency detector (no external dep).
 * Why YIN: more robust on voice than naive autocorrelation, and ~80 lines.
 * Reference: de Cheveigné & Kawahara, "YIN, a fundamental frequency estimator
 * for speech and music" (2002).
 *
 * The mic engine is a class rather than a hook so the lead-mode state machine
 * can drive it from outside React. UI components subscribe via `subscribe()`.
 */

/** One observation from the mic, sampled in the RAF loop. */
export type PitchSample = {
  /** Wall-clock time since the engine started, seconds. */
  time: number;
  /** Estimated fundamental in Hz, or null if unvoiced/silent. */
  f0Hz: number | null;
  /** Pitch in semitones above A1 (55Hz), or null if unvoiced. */
  semitone: number | null;
  /** Root-mean-square energy of the analysis buffer (linear, 0..1ish). */
  rms: number;
};

/** Subscriber callback. Called once per RAF tick while mic is running. */
export type PitchListener = (sample: PitchSample) => void;

/** Convert Hz to semitones above A1 (55Hz). 12 semitones per octave. */
export function hzToSemitones(hz: number): number {
  return 12 * Math.log2(hz / 55);
}

/** Median of an array, ignoring null/NaN. */
export function median(values: ReadonlyArray<number | null>): number | null {
  const xs: number[] = [];
  for (const v of values) {
    if (v != null && Number.isFinite(v)) xs.push(v);
  }
  if (xs.length === 0) return null;
  xs.sort((a, b) => a - b);
  const mid = xs.length >> 1;
  return xs.length % 2 === 1 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

/**
 * Mean absolute error in semitones between a student's contour and an expected
 * one of the same length. Skips frames where either side is null/NaN — the
 * reference can have NaN frames where YIN couldn't detect pitch (consonants
 * or silence inside a word). Returns Infinity if there are no overlapping
 * frames.
 */
export function contourMAE(
  student: ReadonlyArray<number | null>,
  expected: ReadonlyArray<number>,
): number {
  const n = Math.min(student.length, expected.length);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const s = student[i];
    const e = expected[i];
    if (s == null || !Number.isFinite(s)) continue;
    if (!Number.isFinite(e)) continue;
    sum += Math.abs(s - e);
    count++;
  }
  return count > 0 ? sum / count : Infinity;
}

/**
 * Resample an irregular series of (time, semitone) samples to `n` evenly-spaced
 * frames spanning [tStart, tEnd]. Frames with no samples in their bucket → null.
 * Used to align student audio with a fixed-length expected motif contour.
 */
export function resampleSemitones(
  samples: ReadonlyArray<{ time: number; semitone: number | null }>,
  tStart: number,
  tEnd: number,
  n: number,
): Array<number | null> {
  if (n <= 0 || tEnd <= tStart) return [];
  const out = new Array<number | null>(n).fill(null);
  const sums = new Array<number>(n).fill(0);
  const counts = new Array<number>(n).fill(0);
  const span = tEnd - tStart;
  for (const s of samples) {
    if (s.semitone == null) continue;
    if (s.time < tStart || s.time > tEnd) continue;
    let idx = Math.floor(((s.time - tStart) / span) * n);
    if (idx >= n) idx = n - 1;
    if (idx < 0) idx = 0;
    sums[idx] += s.semitone;
    counts[idx]++;
  }
  for (let i = 0; i < n; i++) {
    if (counts[i] > 0) out[i] = sums[i] / counts[i];
  }
  return out;
}

/**
 * YIN fundamental-frequency estimator. Returns Hz, or null if the signal is
 * too noisy / unvoiced for confident detection.
 *
 * @param buffer Time-domain mono samples in [-1, 1].
 * @param sampleRate Hz.
 * @param threshold YIN threshold (lower = stricter); 0.10 is standard.
 */
export function detectPitchYIN(
  buffer: Float32Array,
  sampleRate: number,
  threshold = 0.1,
): number | null {
  const N = buffer.length;
  const halfN = N >> 1;
  if (halfN < 16) return null;

  // Step 1: difference function d(τ) = Σ (x[j] - x[j+τ])² for j in [0, halfN)
  const yinBuffer = new Float32Array(halfN);
  for (let tau = 1; tau < halfN; tau++) {
    let sum = 0;
    for (let j = 0; j < halfN; j++) {
      const delta = buffer[j] - buffer[j + tau];
      sum += delta * delta;
    }
    yinBuffer[tau] = sum;
  }

  // Step 2: cumulative mean normalized difference d'(τ).
  yinBuffer[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau < halfN; tau++) {
    runningSum += yinBuffer[tau];
    yinBuffer[tau] = (yinBuffer[tau] * tau) / runningSum;
  }

  // Step 3: absolute threshold — find first τ with d'(τ) < threshold.
  let tauEstimate = -1;
  for (let tau = 2; tau < halfN; tau++) {
    if (yinBuffer[tau] < threshold) {
      // Walk forward while still descending — find local minimum.
      while (tau + 1 < halfN && yinBuffer[tau + 1] < yinBuffer[tau]) tau++;
      tauEstimate = tau;
      break;
    }
  }
  if (tauEstimate < 0) return null;

  // Step 4: parabolic interpolation around tauEstimate for sub-sample accuracy.
  const x0 = tauEstimate < 1 ? tauEstimate : tauEstimate - 1;
  const x2 = tauEstimate + 1 < halfN ? tauEstimate + 1 : tauEstimate;
  let betterTau = tauEstimate;
  if (x0 !== tauEstimate && x2 !== tauEstimate) {
    const s0 = yinBuffer[x0];
    const s1 = yinBuffer[tauEstimate];
    const s2 = yinBuffer[x2];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (denom !== 0) betterTau = tauEstimate + (s2 - s0) / denom;
  }
  return sampleRate / betterTau;
}

/** Compute RMS (root mean square) of a buffer in [0, ~1]. */
export function rms(buffer: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
  return Math.sqrt(sum / buffer.length);
}

/** Configuration for the mic engine. Sensible defaults bake in for voice. */
export type MicEngineOptions = {
  /** Analysis buffer size — power of 2. 2048 ≈ 46ms @ 44.1kHz, good for voice. */
  fftSize?: number;
  /** Below this RMS, treat as silence and emit f0=null. */
  silenceRms?: number;
  /** YIN threshold; lower = stricter. */
  yinThreshold?: number;
};

/**
 * Wraps getUserMedia + AudioContext + AnalyserNode and produces a stream of
 * pitch samples at the browser's animation-frame rate. Designed to be created
 * once per session and reused across phrases.
 */
export class MicPitchEngine {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: BlobPart[] = [];
  private recordingPromiseResolve: ((blob: Blob | null) => void) | null = null;
  private rafId: number | null = null;
  private startTime = 0;
  private buffer: Float32Array<ArrayBuffer> | null = null;
  private listeners = new Set<PitchListener>();
  private opts: Required<MicEngineOptions>;

  constructor(opts: MicEngineOptions = {}) {
    this.opts = {
      fftSize: opts.fftSize ?? 2048,
      silenceRms: opts.silenceRms ?? 0.012,
      yinThreshold: opts.yinThreshold ?? 0.1,
    };
  }

  /** True once start() has succeeded and the RAF loop is running. */
  get isRunning(): boolean {
    return this.rafId != null;
  }

  /** Subscribe to per-frame pitch samples. Returns an unsubscribe fn. */
  subscribe(fn: PitchListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /**
   * Request mic access and begin sampling. Throws if permission denied or
   * Web Audio is unavailable. Idempotent: calling start() while already
   * running is a no-op.
   */
  async start(): Promise<void> {
    if (this.isRunning) return;
    // Echo cancellation helps if the kid leaves device speakers on, even
    // though lead mode doesn't play reference audio — they may be drilling
    // a phrase between listening passes.
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false, // AGC fights the f0 detector by warping levels
      },
    });
    this.mediaStream = stream;

    type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };
    const Ctx =
      window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
    if (!Ctx) {
      this.cleanupStream();
      throw new Error("Web Audio API not available in this browser.");
    }
    const ctx = new Ctx();
    this.audioCtx = ctx;
    if (ctx.state === "suspended") await ctx.resume();

    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = this.opts.fftSize;
    src.connect(analyser);
    this.sourceNode = src;
    this.analyser = analyser;
    this.buffer = new Float32Array(analyser.fftSize);

    // Start recording the audio stream
    try {
      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/wav";
      console.log(`🎙️ Using MIME type: ${mimeType}`);

      this.mediaRecorder = new MediaRecorder(stream, { mimeType });
      this.recordedChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        console.log("📊 ondataavailable fired, chunk size:", event.data.size);
        if (event.data.size > 0) {
          this.recordedChunks.push(event.data);
          // If we have a pending resolution, resolve it
          if (this.recordingPromiseResolve && this.recordedChunks.length > 0) {
            const blob = new Blob(this.recordedChunks, { type: mimeType });
            this.recordingPromiseResolve(blob);
            this.recordingPromiseResolve = null;
          }
        }
      };

      this.mediaRecorder.onerror = (event) => {
        console.error("❌ MediaRecorder error:", event.error);
      };

      this.mediaRecorder.onstart = () => {
        console.log("▶️ MediaRecorder onstart fired");
      };

      this.mediaRecorder.onstop = () => {
        console.log("⏹️ MediaRecorder onstop fired, chunks collected:", this.recordedChunks.length);
      };

      this.mediaRecorder.start();
      console.log("🎙️ MediaRecorder started, state:", this.mediaRecorder.state);
    } catch (e) {
      console.warn("⚠️ MediaRecorder error:", e);
    }

    this.startTime = performance.now() / 1000;
    const tick = () => {
      const a = this.analyser;
      const buf = this.buffer;
      const c = this.audioCtx;
      if (!a || !buf || !c) return;
      a.getFloatTimeDomainData(buf);
      const sampleRms = rms(buf);
      let f0: number | null = null;
      let semi: number | null = null;
      if (sampleRms >= this.opts.silenceRms) {
        f0 = detectPitchYIN(buf, c.sampleRate, this.opts.yinThreshold);
        if (f0 != null && f0 >= 70 && f0 <= 1000) {
          semi = hzToSemitones(f0);
        } else {
          f0 = null;
        }
      }
      const sample: PitchSample = {
        time: performance.now() / 1000 - this.startTime,
        f0Hz: f0,
        semitone: semi,
        rms: sampleRms,
      };
      for (const fn of this.listeners) fn(sample);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  /** Stop sampling and release the mic. Safe to call multiple times. */
  stop(): void {
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {
        // ignore disconnect errors when the graph is already torn down
      }
    }
    this.sourceNode = null;
    this.analyser = null;
    if (this.audioCtx && this.audioCtx.state !== "closed") {
      void this.audioCtx.close();
    }
    this.audioCtx = null;

    // Stop the media recorder
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      console.log("⏹️ Stopping MediaRecorder, state:", this.mediaRecorder.state);
      this.mediaRecorder.stop();
    } else if (this.mediaRecorder) {
      console.log("⚠️ MediaRecorder already inactive, state:", this.mediaRecorder.state);
    }

    this.cleanupStream();
    this.buffer = null;
  }

  /** Get the captured practice audio as a Blob. Resolves when the take is ready. */
  async getPracticeBlob(): Promise<Blob | null> {
    if (!this.mediaRecorder) {
      console.warn("⚠️ No MediaRecorder available");
      return null;
    }

    const mimeType = this.mediaRecorder.mimeType || "audio/wav";

    // If already have chunks, return immediately
    if (this.recordedChunks.length > 0) {
      console.log("✓ Using cached chunks:", this.recordedChunks.length);
      return new Blob(this.recordedChunks, { type: mimeType });
    }

    console.log("Waiting for chunks..., recorder state:", this.mediaRecorder.state);

    // Wait for ondataavailable to fire
    return new Promise((resolve) => {
      // Store the resolver for the ondataavailable handler
      this.recordingPromiseResolve = resolve;

      // Request data from the recorder (this triggers ondataavailable)
      if (this.mediaRecorder!.state !== "inactive") {
        console.log("📤 Requesting data from recorder");
        this.mediaRecorder!.requestData();
      }

      // Fallback timeout in case events don't fire
      const timeout = setTimeout(() => {
        console.log("⏱️ Timeout waiting for data, chunks:", this.recordedChunks.length);
        this.recordingPromiseResolve = null;
        if (this.recordedChunks.length > 0) {
          resolve(new Blob(this.recordedChunks, { type: mimeType }));
        } else {
          resolve(null);
        }
      }, 500);

      // If ondataavailable fires, clear timeout and resolve
      const onDataAvailable = (event: BlobEvent) => {
        console.log("✓ Got data in event:", event.data.size);
        clearTimeout(timeout);
        this.recordingPromiseResolve = null;
        if (event.data.size > 0) {
          this.recordedChunks.push(event.data);
          resolve(new Blob(this.recordedChunks, { type: mimeType }));
        } else {
          resolve(
            this.recordedChunks.length > 0
              ? new Blob(this.recordedChunks, { type: mimeType })
              : null
          );
        }
      };

      this.mediaRecorder!.addEventListener("dataavailable", onDataAvailable, {
        once: true,
      });
    });
  }

  private cleanupStream(): void {
    if (this.mediaStream) {
      for (const track of this.mediaStream.getTracks()) track.stop();
    }
    this.mediaStream = null;
  }
}

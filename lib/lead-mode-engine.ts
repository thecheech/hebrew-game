/**
 * Lead-mode state machine: the student reads at their own pace, the engine
 * advances a cursor word-by-word using voice activity, and scores each word's
 * pitch contour against the te'am motif when the word "closes".
 *
 * Why three closure signals (not just silence):
 * Chanted parasha is mostly continuous voicing — kids rarely pause between
 * words. Detecting only silence misses every word boundary. So we close on
 * the *first* of:
 *   1. SILENCE — sustained quiet (real breath / long pause).
 *   2. VALLEY — RMS drops below ~45% of the recent voiced peak for ≥35ms,
 *      AND the word has been reading ≥250ms. This is the brief consonant
 *      attack at the start of the next word, even when there's no real gap.
 *   3. TIMEOUT — elapsed ≥ refDuration × maxWordDurationFactor (kid is
 *      running on past the cantor's pace; force-advance).
 *   4. MANUAL — UI calls advance() (button / space-bar fallback).
 *
 * Tonic estimation is a rolling median of recent voiced semitone samples;
 * that's the student's "0" against which te'am motifs are compared.
 */

import {
  contourMAE,
  median,
  type MicPitchEngine,
  type PitchSample,
  resampleSemitones,
} from "@/lib/pitch";
import type { AliyaData, ParashaWord } from "@/lib/parasha-types";
import type { ReferenceContours } from "@/lib/reference-pitch";
import { motifForBreak, sampleMotif } from "@/lib/trope-motifs";

/** Per-word scoring outcome. */
export type WordScore = {
  /** Index in the flat-words array. */
  wordIdx: number;
  /** MAE in semitones between student contour and target (lower is better). */
  semitoneError: number;
  /** Bucketed verdict for UI coloring. */
  verdict: "green" | "yellow" | "red";
  /** Wall time the word's audio started (engine-relative seconds). */
  startedAt: number;
  /** Wall time the word closed. */
  endedAt: number;
  /** Why the word closed — useful for debugging VAD behaviour. */
  closedBy: "silence" | "valley" | "timeout" | "manual" | "stop";
  /** Whether scoring used the real reference contour or fell back to the motif. */
  scoredAgainst: "reference" | "motif";
};

export type LeadModeState =
  | { kind: "idle" }
  | { kind: "waiting"; cursor: number }
  | {
      kind: "reading";
      cursor: number;
      wordStartTime: number;
      voiceLastSeen: number;
    }
  | { kind: "resting"; cursor: number; restingSince: number }
  | { kind: "done"; cursor: number };

export type LeadModeListener = (snapshot: LeadModeSnapshot) => void;

/** Debug-relevant snapshot of recent VAD computations. */
export type VadDebug = {
  /** Most recent RMS sample. */
  currentRms: number;
  /** Rolling peak of voiced RMS over the last peakWindowMs. */
  peakRms: number;
  /** peakRms * valleyRatio — current valley threshold. */
  valleyThreshold: number;
  /** True if currentRms is at or above the onset threshold. */
  isVoiced: boolean;
  /** True if currentRms < valleyThreshold (and has been for some time). */
  inValley: boolean;
  /** Seconds since the active word opened (0 if not reading). */
  timeInWord: number;
};

export type LeadModeSnapshot = {
  state: LeadModeState;
  /** Per-word scores accumulated so far, by wordIdx. */
  scores: ReadonlyMap<number, WordScore>;
  /** Latest mic sample (for live UI). */
  latestSample: PitchSample | null;
  /** Estimated tonic in semitones (rolling median of voiced samples). */
  tonicSemitone: number | null;
  /** Live VAD diagnostics for the debug HUD. */
  debug: VadDebug;
  /** Expected contour for the cursor word — reference if loaded, else motif. */
  expectedContour: number[];
  /** Source of the expected contour shown above. */
  expectedSource: "reference" | "motif" | "none";
};

export type LeadModeScope = {
  /** First word index covered by this practice session (inclusive). */
  startWord: number;
  /** Last word index covered (inclusive). */
  endWord: number;
};

export type LeadModeOptions = {
  /** RMS rising-edge threshold to count as voice onset. */
  onsetRms?: number;
  /** RMS falling-edge threshold (must drop below this to count as offset). */
  offsetRms?: number;
  /** Min sustained loud duration before we transition to reading (ms). */
  onsetSustainMs?: number;
  /** Min sustained quiet duration to close a word (ms). */
  offsetSustainMs?: number;
  /** Hard cap on a word's audio length, in multiples of the reference duration. */
  maxWordDurationFactor?: number;

  /** Valley detection: window over which we track recent voiced peak RMS. */
  peakWindowMs?: number;
  /** Valley = currentRms < peakRms * valleyRatio. */
  valleyRatio?: number;
  /** How long the valley must persist before triggering closure (ms). */
  valleyDurationMs?: number;
  /** Earliest a word can be closed by valley detection, after open (ms). */
  minWordDurationMs?: number;

  /** How many recent voiced samples feed the rolling-tonic median. */
  tonicWindowSamples?: number;
  /** Frame count used to resample student & motif before scoring. */
  scoringFrames?: number;
  /** Verdict thresholds (mean abs error in semitones). */
  greenMaxError?: number;
  yellowMaxError?: number;
};

const DEFAULTS: Required<LeadModeOptions> = {
  // Looser absolute thresholds — chanting carries energy, room ambience matters less.
  onsetRms: 0.02,
  offsetRms: 0.01,
  onsetSustainMs: 60,
  offsetSustainMs: 180,
  // Tighter timeout — when valleys don't fire, fall back fast instead of stalling.
  maxWordDurationFactor: 1.8,
  // Valley detection: this is the new primary signal for chanted speech.
  peakWindowMs: 500,
  valleyRatio: 0.45,
  valleyDurationMs: 35,
  minWordDurationMs: 250,
  tonicWindowSamples: 240, // ~4s at 60Hz
  scoringFrames: 20,
  greenMaxError: 2.0,
  yellowMaxError: 4.0,
};

/**
 * Flatten an aliya's verses into a single word array; the engine works in
 * flat-word coordinates (matches ParashaKaraoke's existing convention).
 */
export function flattenWords(aliya: AliyaData): ParashaWord[] {
  const out: ParashaWord[] = [];
  for (const v of aliya.verses) for (const w of v.words) out.push(w);
  return out;
}

export class LeadModeEngine {
  private aliya: AliyaData;
  private words: ParashaWord[];
  private mic: MicPitchEngine;
  private opts: Required<LeadModeOptions>;
  private scope: LeadModeScope;
  private state: LeadModeState = { kind: "idle" };
  private scores = new Map<number, WordScore>();
  private listeners = new Set<LeadModeListener>();
  private unsubMic: (() => void) | null = null;
  private latestSample: PitchSample | null = null;
  private tonicWindow: number[] = [];
  /** Optional per-word reference contours from the cantor's mp3. */
  private reference: ReferenceContours | null = null;
  // Buffer of {time, semitone} samples for the currently-reading word.
  private wordSamples: Array<{ time: number; semitone: number | null }> = [];
  // Hysteresis state: when did RMS first exceed/drop below thresholds?
  private loudSince: number | null = null;
  private quietSince: number | null = null;
  // Sliding window of recent voiced (rms, time) pairs — for peak tracking.
  private voicedHistory: Array<{ time: number; rms: number }> = [];
  // When did we first see currentRms < valleyThreshold during this word?
  private valleyStartTime: number | null = null;
  // Cached peak so we can show it in the debug HUD without rescanning.
  private currentPeakRms = 0;

  constructor(
    aliya: AliyaData,
    mic: MicPitchEngine,
    scope: LeadModeScope,
    opts: LeadModeOptions = {},
  ) {
    this.aliya = aliya;
    this.words = flattenWords(aliya);
    this.mic = mic;
    this.scope = scope;
    this.opts = { ...DEFAULTS, ...opts };
  }

  subscribe(fn: LeadModeListener): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  /** Begin listening. Mic must already be started before calling this. */
  start(): void {
    if (this.state.kind !== "idle" && this.state.kind !== "done") return;
    this.scores = new Map();
    this.wordSamples = [];
    this.tonicWindow = [];
    this.voicedHistory = [];
    this.valleyStartTime = null;
    this.currentPeakRms = 0;
    this.loudSince = null;
    this.quietSince = null;
    this.state = { kind: "waiting", cursor: this.scope.startWord };
    this.unsubMic?.();
    this.unsubMic = this.mic.subscribe((s) => this.onSample(s));
    this.emit();
  }

  /** Stop processing samples; the mic is left alone (caller manages it). */
  stop(): void {
    this.unsubMic?.();
    this.unsubMic = null;
    if (this.state.kind === "reading") {
      this.closeCurrentWord(this.latestSample?.time ?? 0, "stop");
    }
    this.state =
      this.state.kind === "idle"
        ? this.state
        : { kind: "done", cursor: this.cursor() };
    this.emit();
  }

  /** Reset cursor to a specific word; useful when student drifts. */
  setCursor(wordIdx: number): void {
    const clamped = Math.max(
      this.scope.startWord,
      Math.min(this.scope.endWord, wordIdx),
    );
    if (this.state.kind !== "idle") {
      this.wordSamples = [];
      this.loudSince = null;
      this.quietSince = null;
      this.valleyStartTime = null;
    }
    this.state = { kind: "waiting", cursor: clamped };
    this.emit();
  }

  /** Clear all scores and start over from scope.startWord. */
  reset(): void {
    this.scores = new Map();
    this.wordSamples = [];
    this.tonicWindow = [];
    this.voicedHistory = [];
    this.valleyStartTime = null;
    this.currentPeakRms = 0;
    this.loudSince = null;
    this.quietSince = null;
    this.state = { kind: "waiting", cursor: this.scope.startWord };
    this.emit();
  }

  /** Update scope (e.g., user toggled phrase ↔ aliya). */
  setScope(scope: LeadModeScope): void {
    this.scope = scope;
    this.reset();
  }

  /**
   * Attach (or replace) reference contours extracted from the cantor's mp3.
   * Once set, scoring compares student contour to these instead of the
   * idealized trope motif.
   */
  setReference(ref: ReferenceContours | null): void {
    this.reference = ref;
    this.emit();
  }

  /**
   * Manually close the active word and advance. Used by the UI's "Next" button
   * and the space-bar shortcut. No-op outside of the reading/resting/waiting
   * states, or when already at scope end.
   */
  advance(): void {
    const t = this.latestSample?.time ?? 0;
    if (this.state.kind === "reading") {
      this.closeCurrentWord(t, "manual");
      this.emit();
      return;
    }
    if (this.state.kind === "resting") {
      // Skip the current word entirely with no samples — verdict will be red.
      this.openWord(this.state.cursor, t);
      this.closeCurrentWord(t + 0.05, "manual");
      this.emit();
      return;
    }
    if (this.state.kind === "waiting") {
      // Move the cursor forward without scoring (student wants to skip ahead).
      const nextCursor = Math.min(this.state.cursor + 1, this.scope.endWord);
      if (nextCursor === this.state.cursor) {
        this.state = { kind: "done", cursor: this.scope.endWord };
      } else {
        this.state = { kind: "waiting", cursor: nextCursor };
      }
      this.emit();
    }
  }

  snapshot(): LeadModeSnapshot {
    const expected = this.expectedContourForWord(this.cursor());
    return {
      state: this.state,
      scores: this.scores,
      latestSample: this.latestSample,
      tonicSemitone: this.tonic(),
      debug: this.buildDebug(),
      expectedContour: expected.contour,
      expectedSource: expected.source,
    };
  }

  /**
   * What contour should the student be matching for word `wordIdx`?
   * Prefers the reference contour from the cantor's mp3; falls back to the
   * idealized te'am motif when reference isn't loaded yet.
   */
  private expectedContourForWord(wordIdx: number): {
    contour: number[];
    source: "reference" | "motif" | "none";
  } {
    if (this.reference) {
      const ref = this.reference.contours.get(wordIdx);
      if (ref && ref.length > 0) return { contour: ref, source: "reference" };
    }
    const word = this.words[wordIdx];
    if (!word) return { contour: [], source: "none" };
    const motif = motifForBreak(word.phraseBreak);
    return {
      contour: sampleMotif(motif, this.opts.scoringFrames),
      source: "motif",
    };
  }

  // ---- internals ----

  private cursor(): number {
    if (this.state.kind === "idle") return this.scope.startWord;
    if (this.state.kind === "done") return this.scope.endWord;
    return this.state.cursor;
  }

  private tonic(): number | null {
    return median(this.tonicWindow);
  }

  private pushTonicSample(s: number): void {
    this.tonicWindow.push(s);
    if (this.tonicWindow.length > this.opts.tonicWindowSamples) {
      this.tonicWindow.shift();
    }
  }

  /** Append to voicedHistory and prune entries outside the peak window. */
  private updateVoicedHistory(time: number, rms: number): void {
    if (rms >= this.opts.onsetRms) {
      this.voicedHistory.push({ time, rms });
    }
    const cutoff = time - this.opts.peakWindowMs / 1000;
    while (
      this.voicedHistory.length > 0 &&
      this.voicedHistory[0].time < cutoff
    ) {
      this.voicedHistory.shift();
    }
    let peak = 0;
    for (const e of this.voicedHistory) if (e.rms > peak) peak = e.rms;
    this.currentPeakRms = peak;
  }

  private buildDebug(): VadDebug {
    const sample = this.latestSample;
    const currentRms = sample?.rms ?? 0;
    const peak = this.currentPeakRms;
    const threshold = peak * this.opts.valleyRatio;
    const timeInWord =
      this.state.kind === "reading" && sample
        ? Math.max(0, sample.time - this.state.wordStartTime)
        : 0;
    return {
      currentRms,
      peakRms: peak,
      valleyThreshold: threshold,
      isVoiced: currentRms >= this.opts.onsetRms,
      inValley:
        this.valleyStartTime != null &&
        sample != null &&
        sample.time - this.valleyStartTime >= this.opts.valleyDurationMs / 1000,
      timeInWord,
    };
  }

  private onSample(sample: PitchSample): void {
    this.latestSample = sample;
    if (sample.semitone != null) this.pushTonicSample(sample.semitone);
    this.updateVoicedHistory(sample.time, sample.rms);

    if (this.state.kind === "idle" || this.state.kind === "done") {
      this.emit();
      return;
    }

    // Update simple loud/quiet hysteresis timers (silence-based detection).
    if (sample.rms >= this.opts.onsetRms) {
      if (this.loudSince == null) this.loudSince = sample.time;
      this.quietSince = null;
    } else if (sample.rms < this.opts.offsetRms) {
      if (this.quietSince == null) this.quietSince = sample.time;
      this.loudSince = null;
    }

    if (this.state.kind === "waiting") {
      if (
        this.loudSince != null &&
        sample.time - this.loudSince >= this.opts.onsetSustainMs / 1000
      ) {
        this.openWord(this.state.cursor, this.loudSince);
      }
      this.emit();
      return;
    }

    if (this.state.kind === "reading") {
      // Capture this sample for scoring.
      this.wordSamples.push({ time: sample.time, semitone: sample.semitone });
      if (sample.rms >= this.opts.onsetRms) {
        this.state = {
          ...this.state,
          voiceLastSeen: sample.time,
        };
      }

      const elapsed = sample.time - this.state.wordStartTime;
      const word = this.words[this.state.cursor];
      const refDur = Math.max(0.3, word.end - word.start);
      const minWordSec = this.opts.minWordDurationMs / 1000;

      // Closure signal #1: sustained silence.
      if (
        this.quietSince != null &&
        sample.time - this.quietSince >= this.opts.offsetSustainMs / 1000
      ) {
        this.closeCurrentWord(sample.time, "silence");
        this.emit();
        return;
      }

      // Closure signal #2: valley relative to recent peak.
      // We require: word has been reading for >= minWordDurationMs, peak is
      // meaningful (we have ≥3 voiced samples in window), and currentRms has
      // been below peak * valleyRatio for ≥ valleyDurationMs.
      if (elapsed >= minWordSec && this.voicedHistory.length >= 3) {
        const threshold = this.currentPeakRms * this.opts.valleyRatio;
        if (sample.rms < threshold) {
          if (this.valleyStartTime == null) this.valleyStartTime = sample.time;
          if (
            sample.time - this.valleyStartTime >=
            this.opts.valleyDurationMs / 1000
          ) {
            this.closeCurrentWord(sample.time, "valley");
            this.emit();
            return;
          }
        } else {
          this.valleyStartTime = null;
        }
      }

      // Closure signal #3: hard timeout.
      if (elapsed >= refDur * this.opts.maxWordDurationFactor) {
        this.closeCurrentWord(sample.time, "timeout");
        this.emit();
        return;
      }

      this.emit();
      return;
    }

    if (this.state.kind === "resting") {
      if (
        this.loudSince != null &&
        sample.time - this.loudSince >= this.opts.onsetSustainMs / 1000
      ) {
        this.openWord(this.state.cursor, this.loudSince);
      }
      this.emit();
      return;
    }
  }

  private openWord(cursor: number, atTime: number): void {
    if (cursor > this.scope.endWord) {
      this.state = { kind: "done", cursor: this.scope.endWord };
      return;
    }
    this.wordSamples = [];
    this.valleyStartTime = null;
    // Drop voiced history older than this word's start so the peak reflects
    // the *current* word, not the previous one's tail.
    this.voicedHistory = this.voicedHistory.filter((e) => e.time >= atTime);
    this.state = {
      kind: "reading",
      cursor,
      wordStartTime: atTime,
      voiceLastSeen: atTime,
    };
    this.quietSince = null;
  }

  private closeCurrentWord(
    atTime: number,
    closedBy: WordScore["closedBy"],
  ): void {
    if (this.state.kind !== "reading") return;
    const cursor = this.state.cursor;
    const word = this.words[cursor];
    const startedAt = this.state.wordStartTime;
    const endedAt = atTime;
    const score = this.scoreWord(cursor, word, startedAt, endedAt, closedBy);
    this.scores = new Map(this.scores).set(cursor, score);

    const nextCursor = cursor + 1;
    if (nextCursor > this.scope.endWord) {
      this.state = { kind: "done", cursor: this.scope.endWord };
    } else {
      this.state = { kind: "resting", cursor: nextCursor, restingSince: atTime };
    }
    this.wordSamples = [];
    this.loudSince = null;
    this.quietSince = atTime;
    this.valleyStartTime = null;
  }

  private scoreWord(
    wordIdx: number,
    word: ParashaWord,
    startedAt: number,
    endedAt: number,
    closedBy: WordScore["closedBy"],
  ): WordScore {
    const { contour: expected, source } = this.expectedContourForWord(wordIdx);
    const N = expected.length || this.opts.scoringFrames;
    const tonic = this.tonic();
    const studentSamples = this.wordSamples.map((s) => ({
      time: s.time,
      semitone:
        tonic != null && s.semitone != null ? s.semitone - tonic : null,
    }));
    const sampled = resampleSemitones(
      studentSamples,
      startedAt,
      Math.max(endedAt, startedAt + 0.05),
      N,
    );
    const error = contourMAE(sampled, expected);
    let verdict: WordScore["verdict"];
    if (!Number.isFinite(error)) verdict = "red";
    else if (error <= this.opts.greenMaxError) verdict = "green";
    else if (error <= this.opts.yellowMaxError) verdict = "yellow";
    else verdict = "red";
    return {
      wordIdx,
      semitoneError: error,
      verdict,
      startedAt,
      endedAt,
      closedBy,
      scoredAgainst: source === "reference" ? "reference" : "motif",
    };
  }

  private emit(): void {
    const snap = this.snapshot();
    for (const fn of this.listeners) fn(snap);
  }
}

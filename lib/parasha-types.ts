/**
 * Shapes for the per-aliya parasha JSON files in /public/parasha/<parasha>/.
 * Built by scripts/build-parasha (offline) from PocketTorah's WLC text and timing labels.
 */

export type PhraseBreak =
  | "sof-pasuq"
  | "etnahta"
  | "zaqef"
  | "segol"
  | "shalshelet"
  | null;

export type ParashaWord = {
  /** Full Hebrew with vowels and te'amim (cantillation marks). */
  text: string;
  /** Vowels but no te'amim. */
  noTeamim: string;
  /** Consonants only — what appears in a Torah scroll. */
  plain: string;
  /** WLC source form with `/` morpheme separators (advanced reference). */
  morph: string;
  /** Simple Latin transliteration, Sephardic-Israeli pronunciation. */
  translit: string;
  /** Start time, seconds, into the aliya's sliced audio file. */
  start: number;
  /** End time, seconds (= next word's start, or end of clip). */
  end: number;
  /** Phrase boundary marker if this word ends a phrase. */
  phraseBreak: Exclude<PhraseBreak, null> | null;
};

export type ParashaVerse = {
  /** "43:16" etc. */
  ref: string;
  words: ParashaWord[];
};

export type AliyaData = {
  parasha: string;
  cycle: string;
  aliyaNum: number;
  label: string;
  /** Public path to the sliced mp3, e.g. "/parasha/miketz/audio/aliya1.mp3". */
  audio: string;
  /** Duration of the sliced audio, seconds. */
  duration: number;
  verses: ParashaVerse[];
};

export type ParashaIndex = {
  parasha: string;
  parashaHebrew: string;
  cycle: string;
  date: string;
  dateHebrew: string;
  aliyot: Array<{
    num: number;
    label: string;
    href: string;
    audio: string;
    duration: number;
    verseCount: number;
    wordCount: number;
  }>;
  /**
   * Optional list of cantors with their own audio tracks. The default
   * cantor (`default: true`) has full word-timing alignment baked into the
   * per-aliya JSON files. Alternate cantors can either:
   *   • point at their own pre-aligned per-aliya JSON via `tracks[N].href`
   *     (recommended — produced offline by scripts/align_cantor.py via DTW
   *     against the default cantor), or
   *   • omit `href`, in which case the runtime falls back to linearly
   *     scaling the default cantor's timings to the alt audio's duration
   *     (cheap but drifts on cantors who don't pace proportionally).
   *
   * Mic-based scoring is only meaningful against the cantor whose
   * per-aliya pitch reference was built from
   * (`supportsScoring`).
   *
   * Indexed by aliya number (as string keys, since JSON object keys are
   * strings) so cantors can supply audio for a subset of aliyot if they
   * only provided some.
   */
  cantors?: Array<{
    id: string;
    label: string;
    default?: boolean;
    supportsScoring?: boolean;
    tracks: Record<
      string,
      {
        audio: string;
        duration: number;
        /** Optional path to a per-cantor aliya JSON whose word start/end
         *  times were aligned to *this* cantor's audio (typically via
         *  scripts/align_cantor.py). When absent, the runtime linearly
         *  rescales the default cantor's JSON. */
        href?: string;
      }
    >;
  }>;
};

/**
 * A "phrase" is a contiguous run of words ending at a major te'amim break.
 * We split each verse at sof-pasuq (always), etnahta, zaqef, segol, shalshelet.
 * This gives 3-6 word phrases — the unit a child should loop while learning.
 */
export type Phrase = {
  /** Index in the verse-flat word array where this phrase starts. */
  startWord: number;
  /** Index of the LAST word in this phrase (inclusive). */
  endWord: number;
  /** Audio start (seconds). */
  startTime: number;
  /** Audio end (seconds). */
  endTime: number;
  /** Verse ref this phrase belongs to. */
  verseRef: string;
  /** The te'am that ends this phrase (e.g. 'etnahta'). */
  endsWith: Exclude<PhraseBreak, null>;
};

/**
 * Walk an aliya's verses + words and split into phrases.
 * Every word belongs to exactly one phrase. Phrases never cross verse boundaries.
 */
export function buildPhrases(aliya: AliyaData): Phrase[] {
  const phrases: Phrase[] = [];
  let runStartWord = 0;
  let runStartTime = 0;
  let globalIdx = 0;
  let runVerseRef = aliya.verses[0]?.ref ?? "";

  const allWords: Array<{ w: ParashaWord; verseRef: string }> = [];
  for (const v of aliya.verses) {
    for (const w of v.words) {
      allWords.push({ w, verseRef: v.ref });
    }
  }

  for (let i = 0; i < allWords.length; i++) {
    const { w, verseRef } = allWords[i];
    if (i === runStartWord) {
      runStartTime = w.start;
      runVerseRef = verseRef;
    }
    // Force a break at end of verse even if no marker (defensive).
    const nextVerseRef = allWords[i + 1]?.verseRef;
    const isVerseEnd =
      i === allWords.length - 1 || nextVerseRef !== verseRef;
    const breakHere = w.phraseBreak ?? (isVerseEnd ? "sof-pasuq" : null);

    if (breakHere) {
      phrases.push({
        startWord: runStartWord,
        endWord: i,
        startTime: runStartTime,
        endTime: w.end,
        verseRef: runVerseRef,
        endsWith: breakHere,
      });
      runStartWord = i + 1;
    }
    globalIdx = i;
  }
  // Flush trailing run if no terminal break (shouldn't happen, but defensive)
  if (runStartWord <= globalIdx) {
    const last = allWords[globalIdx];
    if (last) {
      phrases.push({
        startWord: runStartWord,
        endWord: globalIdx,
        startTime: runStartTime,
        endTime: last.w.end,
        verseRef: last.verseRef,
        endsWith: "sof-pasuq",
      });
    }
  }
  return phrases;
}

/**
 * Flatten an aliya's verses into a single word array.
 */
export function flattenWords(aliya: AliyaData): ParashaWord[] {
  const out: ParashaWord[] = [];
  for (const v of aliya.verses) for (const w of v.words) out.push(w);
  return out;
}

/**
 * Re-target an aliya's audio + word timings at a different cantor's
 * track. Word start/end times are scaled linearly by
 * `newDuration / aliya.duration`, which is a coarse approximation —
 * different cantors don't sing at strictly proportional speeds, so
 * mid-aliya highlighting will drift a bit. Good enough for the listen
 * experience; not good enough for mic-based scoring (which is why the
 * caller should also flip practice mode off for non-default cantors).
 *
 * Returns the original aliya unchanged when the override is null/equal,
 * to keep referential equality stable for downstream `useMemo`s.
 */
export function retargetAliyaToCantor(
  aliya: AliyaData,
  override: { audio: string; duration: number } | null,
): AliyaData {
  if (!override) return aliya;
  if (override.audio === aliya.audio && override.duration === aliya.duration) {
    return aliya;
  }
  const ratio =
    aliya.duration > 0 ? override.duration / aliya.duration : 1;
  return {
    ...aliya,
    audio: override.audio,
    duration: override.duration,
    verses: aliya.verses.map((v) => ({
      ...v,
      words: v.words.map((w) => ({
        ...w,
        start: w.start * ratio,
        end: w.end * ratio,
      })),
    })),
  };
}

/**
 * Pronunciation similarity score for a single word, separate from pitch.
 * Computed by DTW-aligning the student's CMVN-normalized MFCC trajectory
 * against the cantor's slice for the same word and averaging per-frame
 * cepstral distance along the warp path. Lower = more similar; thresholds
 * for green/yellow/red live in scripts/analyze_audio.py and need
 * recalibration if MFCC preprocessing changes.
 *
 * This is similarity-to-the-cantor, not phoneme-correctness — different
 * voice timbre and chant-vs-speech delivery still register as distance,
 * so treat the verdict as a coarse "did you say the right thing" signal.
 */
export type PronunciationScore = {
  /** Mean cepstral distance along the DTW warp path. Null when there
   *  weren't enough voiced frames on either side to align. */
  distance: number | null;
  /** Color verdict on pronunciation thresholds (separate scale from the
   *  pitch verdict). Null when the word wasn't attempted. */
  verdict: "green" | "yellow" | "red" | null;
};

/**
 * Result of audio analysis via /api/parasha/analyze.
 * Contains per-word scores and alignment data.
 */
export type WordAnalysisScore = {
  /** Word index in the flat-words array. */
  wordIdx: number;
  /** Mean Absolute Error in semitones between student and reference.
   *  Null when there isn't enough voiced data to compute a score
   *  (e.g. the student stopped before this word). */
  mae: number | null;
  /** Color verdict: green (≤2.0 st), yellow (≤4.0 st), red (>4.0 st).
   *  Null when the word wasn't attempted. */
  verdict: "green" | "yellow" | "red" | null;
  /** Whether the student actually sang far enough to reach this word.
   *  Words with attempted=false should be rendered neutrally, not as red. */
  attempted: boolean;
  /** Duration of the word in student audio, seconds. */
  studentDuration: number;
  /** Duration of the word in reference audio, seconds. */
  referenceDuration: number;
  /** Start time in student audio, seconds. */
  startTime: number;
  /** End time in student audio, seconds. */
  endTime: number;
  /** Pronunciation similarity for this word, scored independently from
   *  pitch. Optional for backward compatibility with cached results from
   *  before pronunciation scoring shipped. */
  pronunciation?: PronunciationScore;
};

/**
 * Result of /api/parasha/analyze-word for a single-word drill.
 * Includes the score plus resampled F0 contours so the UI can plot a
 * cantor-vs-student pitch overlay.
 */
export type WordDrillResult = {
  status: "success" | "error";
  error?: string;
  mode?: "word";
  aliya_num?: number;
  parasha?: string;
  word_idx?: number;
  word_text?: string;
  /** Reference tonic — kept alongside reference_tonic_hz for symmetry. */
  tonic_hz?: number;
  reference_tonic_hz?: number;
  student_tonic_hz?: number;
  word_score?: WordAnalysisScore;
  /** Resampled cantor contour (semitones from cantor's tonic).
   *  Same length as student_contour. Null entries are unvoiced gaps. */
  reference_contour?: Array<number | null>;
  /** Resampled student contour (semitones from student's tonic). */
  student_contour?: Array<number | null>;
};

export type AnalysisResult = {
  status: "success" | "error";
  error?: string;
  aliya_num?: number;
  parasha?: string;
  /** Reference tonic (cantor median voiced pitch). Kept for backward
   *  compatibility — equals reference_tonic_hz. */
  tonic_hz?: number;
  /** Cantor's median voiced pitch in Hz. */
  reference_tonic_hz?: number;
  /** Student's median voiced pitch in Hz — used to normalize the student
   *  contour so a different vocal register doesn't get scored as wrong. */
  student_tonic_hz?: number;
  student_duration?: number;
  reference_duration?: number;
  /** Per-word analysis results. */
  word_scores?: WordAnalysisScore[];
  /** Aliya-level cantor pitch contour, resampled across the voiced span and
   *  expressed in semitones from the cantor's tonic. Same length as
   *  student_contour so the UI can plot index → x-axis directly. Null entries
   *  represent unvoiced gaps. Optional for backward compatibility with cached
   *  results from before this field was emitted. */
  reference_contour?: Array<number | null>;
  /** Aliya-level student pitch contour, in semitones from the student's
   *  tonic. */
  student_contour?: Array<number | null>;
  /** Session-level mean absolute error in semitones, weighted by each
   *  word's reference duration. Null if no attempted words produced a
   *  finite per-word MAE. */
  overall_mae?: number | null;
  /** Session-level score 0–100 derived from overall_mae on the same scale
   *  as the per-word verdicts (0 ST → 100, ≥6 ST → 0). Stable across aliyot
   *  of different lengths. */
  overall_score?: number;
  /** Session-level verdict using the same MAE thresholds as per-word
   *  scoring (green ≤2, yellow ≤4, red >4). */
  overall_verdict?: "green" | "yellow" | "red";
  /** Session-level mean cepstral distance, weighted by each word's
   *  reference duration. Null if no attempted words produced a finite
   *  per-word pronunciation distance. */
  overall_pronunciation_distance?: number | null;
  /** Session-level pronunciation score 0–100, derived from
   *  overall_pronunciation_distance on the pronunciation thresholds.
   *  Independent scale from overall_score (which is pitch). */
  overall_pronunciation_score?: number;
  /** Session-level pronunciation verdict, separate from the pitch
   *  verdict. Same color scale, different thresholds. */
  overall_pronunciation_verdict?: "green" | "yellow" | "red";
  /** How many words the student actually sang far enough to attempt. */
  attempted_words?: number;
  /** Total number of words in the aliya. */
  total_words?: number;
  /** attempted_words / total_words as an integer percent. */
  coverage_pct?: number;
  /** True when the analyzer was invoked with --seg-start / --seg-end and
   *  scored only the practice phrase. word_scores, total_words, and the
   *  roll-up fields all reflect the segment, not the full aliya. */
  segment_mode?: boolean;
  /** Cantor-time start of the practice segment (seconds), or null when
   *  the practice covered the full aliya. */
  segment_start?: number | null;
  /** Cantor-time end of the practice segment (seconds). */
  segment_end?: number | null;
};

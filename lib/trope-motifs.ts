/**
 * Hand-authored idealized pitch contours for the te'amim that appear as phrase
 * markers in our parasha JSON. Each motif is a list of anchor points
 * (timeFraction ∈ [0,1], semitoneOffsetFromTonic). Sampling between anchors is
 * linear.
 *
 * We *don't* try to reproduce the cantor's exact pitches — we only need a
 * shape the student's pitch contour should resemble. The scorer normalizes for
 * the student's key (kids sing higher than the cantor) and compares contour
 * shapes, not absolute Hz.
 *
 * Coverage: the JSON only marks phrase-ending te'amim. We use a generic
 * "conjunctive" motif for words with `phraseBreak: null` — most disjunctives
 * sit on or near the tonic with a small lift, so a slight upward inflection
 * is a reasonable default.
 *
 * Style basis: Ashkenazi nusach (matches PocketTorah's reference audio). The
 * shapes are stylized — meant to be forgiving for a child learner.
 */

import type { PhraseBreak } from "@/lib/parasha-types";

/** A motif is a piecewise-linear curve in (timeFraction, semitones) space. */
export type Motif = {
  /** Human-readable name. */
  name: string;
  /** Anchor points; first must have t=0, last must have t=1. */
  anchors: Array<{ t: number; semitones: number }>;
};

/**
 * Words with no phraseBreak — the conjunctive/servient te'amim collectively.
 * Slight lift then settle: a "leading" motion into the next disjunctive.
 */
const CONJUNCTIVE: Motif = {
  name: "conjunctive",
  anchors: [
    { t: 0, semitones: 0 },
    { t: 0.5, semitones: 1 },
    { t: 1, semitones: 0.5 },
  ],
};

/**
 * Segol — small disjunctive, short rising-falling figure resolving above tonic.
 */
const SEGOL: Motif = {
  name: "segol",
  anchors: [
    { t: 0, semitones: 1 },
    { t: 0.4, semitones: 3 },
    { t: 0.7, semitones: 1 },
    { t: 1, semitones: 2 },
  ],
};

/**
 * Zaqef (qaton) — characteristic up-and-hold, then drop. Two dots above the
 * letter; the music dwells on a higher note before settling.
 */
const ZAQEF: Motif = {
  name: "zaqef",
  anchors: [
    { t: 0, semitones: 0 },
    { t: 0.25, semitones: 3 },
    { t: 0.7, semitones: 3 },
    { t: 1, semitones: -1 },
  ],
};

/**
 * Etnahta — the major mid-verse pause. A clear descent from above the tonic
 * to below, with a small rise at the very end (the "comma" feeling).
 */
const ETNAHTA: Motif = {
  name: "etnahta",
  anchors: [
    { t: 0, semitones: 2 },
    { t: 0.3, semitones: 0 },
    { t: 0.7, semitones: -2 },
    { t: 1, semitones: -1 },
  ],
};

/**
 * Sof-pasuq (silluq) — end of verse cadence. Stronger, more conclusive descent
 * than etnahta, settling firmly on the low tonic.
 */
const SOF_PASUQ: Motif = {
  name: "sof-pasuq",
  anchors: [
    { t: 0, semitones: 1 },
    { t: 0.3, semitones: 0 },
    { t: 0.6, semitones: -1 },
    { t: 1, semitones: -2 },
  ],
};

/**
 * Shalshelet — rare, dramatic. Three ascending peaks. We keep the basic
 * "three rises" shape; the cantor will linger and the word will be long.
 */
const SHALSHELET: Motif = {
  name: "shalshelet",
  anchors: [
    { t: 0, semitones: 0 },
    { t: 0.2, semitones: 4 },
    { t: 0.4, semitones: 1 },
    { t: 0.6, semitones: 4 },
    { t: 0.8, semitones: 1 },
    { t: 1, semitones: 4 },
  ],
};

const MOTIF_BY_BREAK: Record<NonNullable<PhraseBreak>, Motif> = {
  segol: SEGOL,
  zaqef: ZAQEF,
  etnahta: ETNAHTA,
  "sof-pasuq": SOF_PASUQ,
  shalshelet: SHALSHELET,
};

/** Pick the motif for a given phraseBreak (null → conjunctive). */
export function motifForBreak(breakKind: PhraseBreak): Motif {
  if (breakKind == null) return CONJUNCTIVE;
  return MOTIF_BY_BREAK[breakKind];
}

/**
 * Sample a motif at `n` evenly-spaced points across [0,1], returning an array
 * of semitone offsets. Suitable for plotting or for comparing to a student's
 * downsampled contour.
 */
export function sampleMotif(motif: Motif, n: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [motif.anchors[0]?.semitones ?? 0];
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    out[i] = sampleMotifAt(motif, t);
  }
  return out;
}

/** Sample at a single fraction t ∈ [0,1]. Linear between anchors. */
export function sampleMotifAt(motif: Motif, t: number): number {
  const a = motif.anchors;
  if (a.length === 0) return 0;
  if (t <= a[0].t) return a[0].semitones;
  if (t >= a[a.length - 1].t) return a[a.length - 1].semitones;
  // Linear search is fine — motifs have ≤ 6 anchors.
  for (let i = 1; i < a.length; i++) {
    if (t <= a[i].t) {
      const prev = a[i - 1];
      const next = a[i];
      const span = next.t - prev.t;
      const frac = span > 0 ? (t - prev.t) / span : 0;
      return prev.semitones + (next.semitones - prev.semitones) * frac;
    }
  }
  return a[a.length - 1].semitones;
}

#!/usr/bin/env python3
"""
Cross-cantor word-timing aligner.

Given a default-cantor recording with hand-aligned word boundaries (in a
parasha aliya JSON), and an alternate-cantor recording of the same text,
compute new word boundaries for the alternate recording by Dynamic Time
Warping the two recordings against each other.

The two recordings say identical Hebrew word-for-word (same parasha, same
verse range), so an MFCC-similarity DTW path gives us a monotonic time
mapping  f: t_default → t_alt. We push every word's start/end through f
and write a fresh JSON in the same shape as the input — the runtime
loader doesn't need to know an alignment ever happened.

Usage:
    python3 scripts/align_cantor.py \\
        <default_audio> <alt_audio> <default_json> <output_json>

Example:
    python3 scripts/align_cantor.py \\
        public/parasha/miketz/audio/aliya1.mp3 \\
        public/parasha/miketz/audio/alt/aliya1.mp3 \\
        public/parasha/miketz/aliya1.json \\
        public/parasha/miketz/alt/aliya1.json

Quality notes
-------------
* Accuracy is typically within one or two MFCC frames (~50–150 ms at
  the defaults below). Long melismas and ornamentation differences can
  drift further; the verification report at the bottom prints the
  worst-case word duration ratios so you can spot egregious cases.
* DTW is run on cosine distance over CMVN-normalized MFCCs so that
  timbre differences between cantors don't dominate. Step pattern is
  the librosa default (1,1)/(1,0)/(0,1).
* Audio is resampled to 16 kHz mono (same as analyze_audio.py) — this
  is plenty for word-level alignment and keeps memory bounded for the
  full-aliya case.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Iterable, Tuple

try:
    import numpy as np
    import librosa
    from scipy.interpolate import interp1d
except ImportError as e:
    print(
        f"Missing dependency: {e}. Install with: pip install -r scripts/requirements.txt",
        file=sys.stderr,
    )
    sys.exit(1)


SR = 16_000           # Mono 16k — same as analyze_audio.py
HOP_LENGTH = 512      # ~32 ms at 16k. ~32k frames over a 30 min aliya, fine.
N_MFCC = 20           # 13 standard + 7 for richer timbre discrimination
HOP_SECONDS = HOP_LENGTH / SR


def cmvn(mfcc: np.ndarray) -> np.ndarray:
    """Per-coefficient mean/variance normalize — strips overall loudness
    and the singer's average timbre, leaving the time-varying spectral
    shape that DTW should be matching on."""
    mean = mfcc.mean(axis=1, keepdims=True)
    std = mfcc.std(axis=1, keepdims=True) + 1e-8
    return (mfcc - mean) / std


def load_mfcc(path: str) -> Tuple[np.ndarray, float]:
    """Load audio and return (CMVN-normalized MFCC, duration_seconds)."""
    y, _ = librosa.load(path, sr=SR, mono=True)
    if y.size == 0:
        raise ValueError(f"Empty audio: {path}")
    duration = len(y) / SR
    mfcc = librosa.feature.mfcc(
        y=y, sr=SR, n_mfcc=N_MFCC, hop_length=HOP_LENGTH
    )
    mfcc = cmvn(mfcc)
    return mfcc.astype(np.float32), duration


def dtw_warp_path(
    mfcc_default: np.ndarray, mfcc_alt: np.ndarray
) -> np.ndarray:
    """Run librosa DTW and return the warp path (M, 2) ordered start→end.

    librosa returns the path end→start, with rows (i_default, j_alt).
    We reverse it so callers can iterate forward in default time.
    """
    _D, wp = librosa.sequence.dtw(
        X=mfcc_default,
        Y=mfcc_alt,
        metric="cosine",
        # Default step pattern (1,1)/(1,0)/(0,1) is fine for our purposes.
        # subseq=False because both recordings cover the *whole* aliya;
        # we want the path to span both endpoints.
        subseq=False,
    )
    # wp shape: (path_len, 2), columns = (X_idx, Y_idx) = (default, alt)
    return wp[::-1].astype(np.int64)


def build_time_mapping(wp: np.ndarray) -> "interp1d":
    """Convert a frame-index warp path into a callable f(t_default) → t_alt.

    For each unique default frame i, take the median alt frame j (DTW
    can stutter horizontally or vertically; the median is a stable pick
    when several alt frames map to one default frame). Then build a
    linear interpolator over (t_default, t_alt) seconds, with the
    endpoints clamped via fill_value.
    """
    # Group alt indices by default index → median alt index per default frame.
    df_idx = wp[:, 0]
    alt_idx = wp[:, 1]
    # Sorted-stable groupby via np.unique
    uniq_df, inv = np.unique(df_idx, return_inverse=True)
    medians = np.empty(uniq_df.shape, dtype=np.float64)
    for k in range(uniq_df.size):
        medians[k] = np.median(alt_idx[inv == k])

    t_default = uniq_df * HOP_SECONDS
    t_alt = medians * HOP_SECONDS

    # Pin the very first and very last frames so endpoint anchoring is
    # tight even if DTW briefly meanders near the edges.
    if t_default[0] > 0:
        t_default = np.concatenate([[0.0], t_default])
        t_alt = np.concatenate([[0.0], t_alt])

    return interp1d(
        t_default,
        t_alt,
        kind="linear",
        bounds_error=False,
        fill_value=(float(t_alt[0]), float(t_alt[-1])),
        assume_sorted=True,
    )


def remap_aliya(
    aliya: dict,
    f: "interp1d",
    new_audio: str,
    new_duration: float,
) -> dict:
    """Return a copy of `aliya` with word start/end remapped through `f`,
    `audio` overwritten, and `duration` set to the alt recording's
    actual length."""
    out = dict(aliya)
    out["audio"] = new_audio
    out["duration"] = round(float(new_duration), 3)
    out["verses"] = []
    for v in aliya["verses"]:
        new_words = []
        for w in v["words"]:
            ns = float(f(w["start"]))
            ne = float(f(w["end"]))
            # Guarantee monotonicity — DTW's median pick can occasionally
            # produce a tie or tiny inversion at silence boundaries. Snap
            # end >= start with a 1 ms minimum gap so the karaoke
            # highlighter doesn't divide-by-zero on degenerate spans.
            if ne < ns + 1e-3:
                ne = ns + 1e-3
            new_words.append(
                {
                    **w,
                    "start": round(ns, 3),
                    "end": round(ne, 3),
                }
            )
        out["verses"].append({**v, "words": new_words})

    # Final pass: enforce monotonicity across word boundaries (each
    # word's start should be ≥ the previous word's start). Tiny
    # inversions at phrase joins are clamped, large ones surface in the
    # verification report so they're visible.
    prev_start = -math.inf
    for v in out["verses"]:
        for w in v["words"]:
            if w["start"] < prev_start:
                w["start"] = round(prev_start, 3)
                if w["end"] < w["start"] + 1e-3:
                    w["end"] = round(w["start"] + 1e-3, 3)
            prev_start = w["start"]

    return out


def verification_report(
    aligned: dict, default_aliya: dict, alt_duration: float
) -> dict:
    """Produce a human-readable sanity report on the alignment quality."""
    aligned_words = [w for v in aligned["verses"] for w in v["words"]]
    default_words = [w for v in default_aliya["verses"] for w in v["words"]]
    assert len(aligned_words) == len(default_words), (
        "word count drift between default and aligned"
    )

    # Per-word duration ratio: alt_dur / default_dur. We expect a
    # narrow distribution (cantors don't sing one word 5× longer than
    # the other if both are doing the same trope). Outliers indicate
    # places DTW probably got confused.
    ratios = []
    for da, db in zip(default_words, aligned_words):
        d_dur = max(1e-6, da["end"] - da["start"])
        a_dur = max(1e-6, db["end"] - db["start"])
        ratios.append(a_dur / d_dur)
    ratios_arr = np.array(ratios)

    last_aligned = aligned_words[-1]["end"]
    return {
        "total_words": len(aligned_words),
        "default_audio_seconds": round(default_aliya["duration"], 3),
        "alt_audio_seconds": round(alt_duration, 3),
        "last_word_end_seconds": round(last_aligned, 3),
        "tail_gap_seconds": round(alt_duration - last_aligned, 3),
        "duration_ratio_min": round(float(ratios_arr.min()), 3),
        "duration_ratio_p50": round(float(np.percentile(ratios_arr, 50)), 3),
        "duration_ratio_p95": round(float(np.percentile(ratios_arr, 95)), 3),
        "duration_ratio_max": round(float(ratios_arr.max()), 3),
        "expected_global_ratio": round(
            alt_duration / max(1e-6, default_aliya["duration"]), 3
        ),
    }


def public_path(filesystem_path: str) -> str:
    """Convert a filesystem path under `public/` to a leading-slash URL.

    e.g. ``public/parasha/miketz/audio/alt/aliya1.mp3`` →
    ``/parasha/miketz/audio/alt/aliya1.mp3``.
    Used so the JSON we emit holds the same kind of URL the runtime
    expects in its existing aliyaN.json files.
    """
    p = Path(filesystem_path).as_posix()
    if "public/" in p:
        return "/" + p.split("public/", 1)[1]
    return p


def main(argv: Iterable[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("default_audio", help="Path to the default-cantor MP3/WAV")
    parser.add_argument("alt_audio", help="Path to the alt-cantor MP3/WAV")
    parser.add_argument(
        "default_json", help="Path to the default-cantor aliya JSON"
    )
    parser.add_argument(
        "output_json",
        help="Where to write the alt-cantor aliya JSON (parent dir must exist or will be created)",
    )
    parser.add_argument(
        "--alt-audio-url",
        help=(
            "Optional explicit URL to embed in the output JSON's `audio` "
            "field. Defaults to the alt_audio path with the leading "
            "`public/` stripped."
        ),
        default=None,
    )
    args = parser.parse_args(list(argv))

    print(f"[align] loading {args.default_audio}", file=sys.stderr)
    mfcc_default, dur_default = load_mfcc(args.default_audio)
    print(
        f"[align]   {dur_default:.2f}s, {mfcc_default.shape[1]} frames",
        file=sys.stderr,
    )

    print(f"[align] loading {args.alt_audio}", file=sys.stderr)
    mfcc_alt, dur_alt = load_mfcc(args.alt_audio)
    print(
        f"[align]   {dur_alt:.2f}s, {mfcc_alt.shape[1]} frames",
        file=sys.stderr,
    )

    print(
        f"[align] running DTW: {mfcc_default.shape[1]} x {mfcc_alt.shape[1]} cells",
        file=sys.stderr,
    )
    wp = dtw_warp_path(mfcc_default, mfcc_alt)
    print(f"[align]   warp path length: {len(wp)}", file=sys.stderr)

    f = build_time_mapping(wp)

    with open(args.default_json, "r", encoding="utf-8") as fh:
        default_aliya = json.load(fh)

    alt_audio_url = args.alt_audio_url or public_path(args.alt_audio)
    aligned = remap_aliya(
        default_aliya, f, new_audio=alt_audio_url, new_duration=dur_alt
    )

    out_path = Path(args.output_json)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(aligned, fh, ensure_ascii=False, indent=2)
        fh.write("\n")

    report = verification_report(aligned, default_aliya, dur_alt)
    print("[align] verification report:", file=sys.stderr)
    for k, v in report.items():
        print(f"  {k:32s} {v}", file=sys.stderr)
    print(f"[align] wrote {out_path}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

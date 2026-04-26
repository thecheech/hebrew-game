#!/usr/bin/env python3
"""
Audio analysis script for Hebrew chanting evaluation.

Two modes:

1. Aliya mode (default):
     python3 analyze_audio.py <student_wav> <reference_mp3> <aliya_num> <parasha>
   Scores every word in the aliya against the cantor and writes per-word
   scores to stdout.

2. Word-drill mode:
     python3 analyze_audio.py <student_wav> <reference_mp3> <aliya_num> <parasha> --word <wordIdx>
   Scores a single word (the student recording is assumed to be JUST that
   word) and includes resampled F0 contours for both speakers so the
   frontend can render an overlay for visual feedback.

Output: JSON to stdout, errors to stderr.
"""

import argparse
import math
import sys
import json
from typing import Optional
import numpy as np
from pathlib import Path


def _sanitize_for_json(obj):
    """
    Recursively replace inf/nan with None so json.dumps can emit strict JSON.

    Python's json module writes Infinity/-Infinity/NaN by default (allow_nan=True),
    which is not valid JSON and is rejected by JSON.parse on the JS side. We turn
    those into null instead — the frontend treats null mae as "no data".
    """
    if isinstance(obj, dict):
        return {k: _sanitize_for_json(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize_for_json(v) for v in obj]
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    return obj

# Try imports with informative errors
try:
    import librosa
except ImportError:
    print(
        json.dumps(
            {"error": "librosa not installed. Run: pip install librosa scipy"}
        ),
        file=sys.stderr,
    )
    sys.exit(1)

from scipy.spatial.distance import euclidean
from scipy.interpolate import interp1d


CACHE_DIR = Path(__file__).parent / ".cache"


def extract_f0(audio_path: str, sr: int = 16000, hop_length: int = 512) -> tuple:
    """
    Extract fundamental frequency (f0) contour using librosa's pyin.

    Voicing is gated to reject mains hum and dead-room frames without
    rejecting genuine but quiet voiced frames:
      1. fmin = 75 Hz so the search range sits above 50/60 Hz mains hum and
         their nearest subharmonic neighbours. Without this, a recording that
         starts with 1–2 s of silence-but-with-hum gets an f0 ≈ 60 Hz median
         and the "tonic" lands on the hum instead of the singer's voice — the
         student's actual voice then registers as ~19 semitones high and the
         word-drill score is permanently red. This is the load-bearing gate.
      2. pyin's own voiced_flag must be true. We do NOT add a hard threshold
         on voiced_probs — pyin's default no_trough_prob is 0.01 and on short
         word recordings real voice often sits at probs 0.3–0.5, so any tighter
         threshold rejects whole syllables as unvoiced and the student tonic
         then falls back to the cantor's (264/264 in the bug report).
      3. Frame RMS must clear 5 % of the recording's peak RMS. A peak-based
         floor scales with recording level so a quiet mic isn't rejected, and
         (unlike a median-based floor) doesn't reject its own voiced section
         when the recording is mostly voice.

    Frames that fail any gate are written as NaN, which trim_to_voiced and
    the median-tonic step both treat as unvoiced.

    Args:
        audio_path: Path to audio file
        sr: Sample rate (will resample if needed)
        hop_length: Hop length for frame processing

    Returns:
        (f0_hz, times, sr, hop_length): f0 array (NaN at unvoiced frames),
        time array, sample rate, hop length
    """
    try:
        y, sr_loaded = librosa.load(audio_path, sr=sr)
    except Exception as e:
        raise RuntimeError(f"Failed to load audio: {e}")

    if len(y) < sr:
        raise RuntimeError("Audio file too short")

    try:
        # Use librosa's pyin F0 estimator (more robust for singing than piptrack).
        # Note: do NOT pass `trough_threshold` — that parameter does not exist
        # in librosa.pyin. The closest knob is `no_trough_prob` (default 0.01),
        # which we leave at its default.
        f0, voiced_flag, voiced_probs = librosa.pyin(
            y,
            fmin=75,
            fmax=400,
            sr=sr,
            hop_length=hop_length,
        )
    except Exception as e:
        raise RuntimeError(f"Failed to extract F0: {e}")

    # Per-frame energy. Use the same hop as pyin so the arrays align frame
    # for frame; choose a frame_length wide enough for a stable RMS estimate.
    try:
        frame_length = max(hop_length * 2, 1024)
        rms_frames = librosa.feature.rms(
            y=y, frame_length=frame_length, hop_length=hop_length, center=True
        )[0]
    except Exception:
        rms_frames = np.full(len(f0), 1.0, dtype=float)

    n = min(len(f0), len(voiced_flag), len(voiced_probs), len(rms_frames))
    f0 = np.asarray(f0, dtype=float)[:n]
    voiced_flag = np.asarray(voiced_flag, dtype=bool)[:n]
    voiced_probs = np.asarray(voiced_probs, dtype=float)[:n]
    rms_frames = np.asarray(rms_frames, dtype=float)[:n]

    # Energy gate keyed off the recording's PEAK RMS, not its median. A
    # median-based floor rejects voice in recordings that are mostly voice;
    # a peak-based floor scales with recording level instead. Setting the
    # threshold at 5 % of peak rejects the noise floor (which is typically
    # 30–50 dB below peak) while keeping every voiced syllable, even quiet
    # consonant transitions.
    peak_rms = float(np.max(rms_frames)) if rms_frames.size else 0.0
    rms_floor = max(1e-4, peak_rms * 0.05)
    energy_voiced = rms_frames > rms_floor
    f0_clean = np.where(voiced_flag & energy_voiced, f0, np.nan)

    times = librosa.frames_to_time(
        np.arange(n), sr=sr, hop_length=hop_length
    )

    return f0_clean, times, sr, hop_length


def extract_f0_cached(
    audio_path: str,
    cache_key: str,
    sr: int = 16000,
    hop_length: int = 512,
) -> tuple:
    """
    Like extract_f0, but caches the result on disk keyed by (cache_key, sr,
    hop_length, audio mtime+size). The first call writes the cache; subsequent
    calls load it and skip the expensive pyin pass.

    Use this for the cantor reference — it's the same file every request and
    pyin on a multi-minute aliya is the dominant cost.
    """
    try:
        st = Path(audio_path).stat()
    except FileNotFoundError as e:
        raise RuntimeError(f"Reference audio missing: {audio_path}") from e

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    # Bump the version suffix any time extract_f0's voicing logic changes;
    # the cached arrays embed the old voicing decisions and would otherwise
    # silently keep serving them.
    #   v2 = fmin 75 + voiced_probs > 0.5 + RMS gate vs. median  (too strict —
    #        rejected whole student recordings as unvoiced)
    #   v3 = fmin 75 + voiced_flag only + RMS gate vs. peak       (current)
    cache_version = "v3"
    cache_path = (
        CACHE_DIR / f"{cache_key}_sr{sr}_hop{hop_length}_{cache_version}.npz"
    )

    if cache_path.exists():
        try:
            data = np.load(cache_path, allow_pickle=False)
            cached_mtime = float(data["src_mtime"])
            cached_size = int(data["src_size"])
            if cached_mtime == st.st_mtime and cached_size == st.st_size:
                f0 = data["f0"]
                times = data["times"]
                return f0, times, int(data["sr"]), int(data["hop_length"])
            # else: source file changed — fall through and recompute
        except Exception as e:
            print(
                f"Warning: failed to read F0 cache {cache_path}: {e}",
                file=sys.stderr,
            )

    f0, times, sr_out, hop_out = extract_f0(audio_path, sr=sr, hop_length=hop_length)

    try:
        np.savez(
            cache_path,
            f0=f0,
            times=times,
            sr=np.int64(sr_out),
            hop_length=np.int64(hop_out),
            src_mtime=np.float64(st.st_mtime),
            src_size=np.int64(st.st_size),
        )
    except Exception as e:
        print(
            f"Warning: failed to write F0 cache {cache_path}: {e}",
            file=sys.stderr,
        )

    return f0, times, sr_out, hop_out


def extract_mfcc(
    audio_path: str,
    sr: int = 16000,
    hop_length: int = 512,
    n_mfcc: int = 13,
) -> tuple:
    """
    Extract per-frame phonetic-transition features for pronunciation comparison.

    The output is the FIRST DERIVATIVE of MFCC over time (Δ MFCC) — and
    nothing else. Static MFCC is intentionally discarded.

    Why Δ-only:

      Static MFCC ≈ instantaneous spectral envelope ≈ (vocal tract shape +
      phonetic content + channel). The vocal tract shape varies by speaker
      (length, gender, age, cavity geometry) and the channel varies by
      mic and room. Together they typically dominate the per-frame signal:
      two different speakers saying the same word land at cosine distance
      ~0.5–0.7 in static-MFCC space, which is indistinguishable from
      "different word." Per-utterance mean normalization (CMN) only
      removes a constant offset; CMVN crushes everything to look the same.

      The first derivative Δ MFCC = MFCC[t+1] - MFCC[t-1] (or a
      smoothed equivalent) cancels any constant per-coefficient offset
      analytically. What survives is how the spectrum is *changing* —
      consonant onsets, formant transitions, vowel onsets. That signal
      is much more about content than speaker. Same-word/different-speaker
      pairs land lower in cosine distance, while different-word pairs
      diverge sharply because their transition events happen at different
      times and in different directions.

      Hop length and sample rate match extract_f0 so the feature frames
      align 1:1 with the F0 frames; the F0 voicing mask is reused to
      restrict scoring to voiced regions.

    Args:
        audio_path: Path to audio file.
        sr: Sample rate (resamples if needed).
        hop_length: Frame hop. Must equal extract_f0's hop for alignment.
        n_mfcc: MFCC count before dropping the 0th coefficient.

    Returns:
        (features, times): features shape (T, n_mfcc-1) — each row is the
        Δ MFCC for one frame. times is the per-frame time axis.
    """
    try:
        y, _ = librosa.load(audio_path, sr=sr)
    except Exception as e:
        raise RuntimeError(f"Failed to load audio for MFCC: {e}")

    if len(y) < sr // 4:
        raise RuntimeError("Audio file too short for MFCC")

    n_fft = max(hop_length * 4, 2048)
    try:
        mfcc = librosa.feature.mfcc(
            y=y,
            sr=sr,
            hop_length=hop_length,
            n_fft=n_fft,
            n_mfcc=n_mfcc,
        )  # (n_mfcc, T)
    except Exception as e:
        raise RuntimeError(f"Failed to extract MFCC: {e}")

    # Drop the 0th coefficient (energy). Pronunciation should not be charged
    # for loudness; deltas of energy tell us "did the syllables happen at
    # the right times" but that's already captured by F0 voicing.
    mfcc = mfcc[1:, :]

    # First-difference deltas. librosa's delta uses Savitzky-Golay smoothing
    # over `width` frames so single-frame noise doesn't dominate the
    # derivative. The default width=9 needs at least 9 frames; on short
    # clips fall back to numpy.gradient (works on any length ≥ 2).
    try:
        features = librosa.feature.delta(mfcc, width=9)
    except Exception:
        features = np.gradient(mfcc, axis=1)

    times = librosa.frames_to_time(
        np.arange(features.shape[1]), sr=sr, hop_length=hop_length
    )

    # (T, D) so each row is a frame — convenient for masking by voicing
    # and slicing by time window downstream.
    return features.T.astype(np.float32, copy=False), times


def extract_mfcc_cached(
    audio_path: str,
    cache_key: str,
    sr: int = 16000,
    hop_length: int = 512,
    n_mfcc: int = 13,
) -> tuple:
    """
    Disk-cached version of extract_mfcc, keyed on (cache_key, sr, hop_length,
    n_mfcc, audio mtime+size). Use for the cantor reference; the student
    recording is unique per request and shouldn't be cached.
    """
    try:
        st = Path(audio_path).stat()
    except FileNotFoundError as e:
        raise RuntimeError(f"Reference audio missing: {audio_path}") from e

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    # Bump on any change to extract_mfcc's preprocessing (CMN, deltas,
    # dropped coefficients, etc.) so stale arrays don't get served.
    #   v1 = CMVN + 12-D static                  (too forgiving)
    #   v2 = CMN + static + Δ MFCC = 24-D        (false negatives across speakers)
    #   v3 = Δ MFCC only = 12-D                  (current; speaker-invariant)
    cache_version = "v3"
    cache_path = (
        CACHE_DIR
        / f"{cache_key}_mfcc_sr{sr}_hop{hop_length}_n{n_mfcc}_{cache_version}.npz"
    )

    if cache_path.exists():
        try:
            data = np.load(cache_path, allow_pickle=False)
            cached_mtime = float(data["src_mtime"])
            cached_size = int(data["src_size"])
            if cached_mtime == st.st_mtime and cached_size == st.st_size:
                return data["mfcc"], data["times"]
        except Exception as e:
            print(
                f"Warning: failed to read MFCC cache {cache_path}: {e}",
                file=sys.stderr,
            )

    mfcc, times = extract_mfcc(
        audio_path, sr=sr, hop_length=hop_length, n_mfcc=n_mfcc
    )

    try:
        np.savez(
            cache_path,
            mfcc=mfcc,
            times=times,
            src_mtime=np.float64(st.st_mtime),
            src_size=np.int64(st.st_size),
        )
    except Exception as e:
        print(
            f"Warning: failed to write MFCC cache {cache_path}: {e}",
            file=sys.stderr,
        )

    return mfcc, times


def _dtw_cepstral_distance(
    student_mfcc: np.ndarray, ref_mfcc: np.ndarray
) -> float:
    """
    DTW-align two cepstral feature sequences and return mean per-frame
    cosine distance along the warp path.

    Both inputs are shape (T, D). DTW finds the lowest-cost monotonic
    alignment (so a slightly faster or slower student isn't penalized for
    tempo) and then we average per-step cosine distance along that path.

    Cosine distance is bounded [0, 2] regardless of feature dimensionality,
    so thresholds carry over from one configuration to another and the score
    isn't dominated by feature magnitude. Empirically:
      • Same word, similar speaker → mean cosine in 0.05–0.15
      • Same word, different speaker / chant style → 0.15–0.30
      • Different content → 0.30–0.6+
    Plain Euclidean MFCC + DTW does not give that separation: under CMVN
    every utterance lands at unit variance and any two short speech clips
    average to mean Euclidean ≈ √D, the entire dynamic range disappears.

    Returns +inf if either sequence is too short to align.
    """
    if student_mfcc.shape[0] < 2 or ref_mfcc.shape[0] < 2:
        return float("inf")

    # librosa.sequence.dtw expects shape (D, T)
    s = student_mfcc.T.astype(np.float64, copy=False)
    r = ref_mfcc.T.astype(np.float64, copy=False)

    try:
        _D, wp = librosa.sequence.dtw(X=s, Y=r, metric="cosine")
    except Exception:
        return float("inf")

    # wp is (path_len, 2) running end→start; column 0 = student idx, 1 = ref idx.
    s_idx = wp[:, 0]
    r_idx = wp[:, 1]
    s_pairs = student_mfcc[s_idx].astype(np.float64)
    r_pairs = ref_mfcc[r_idx].astype(np.float64)

    # Cosine distance per pair = 1 - (s·r) / (||s|| ||r||). The +eps
    # prevents division blowups on a rare all-zero feature row.
    dots = np.sum(s_pairs * r_pairs, axis=1)
    s_norm = np.linalg.norm(s_pairs, axis=1)
    r_norm = np.linalg.norm(r_pairs, axis=1)
    denom = (s_norm * r_norm) + 1e-12
    cos_sim = dots / denom
    # Clip into [-1, 1] to absorb floating-point overshoot; map to distance.
    cos_sim = np.clip(cos_sim, -1.0, 1.0)
    cos_dist = 1.0 - cos_sim

    if not cos_dist.size:
        return float("inf")
    return float(np.mean(cos_dist))


def _voiced_window_mfcc(
    times: np.ndarray,
    mfcc: np.ndarray,
    f0_clean: np.ndarray,
    t_start: Optional[float] = None,
    t_end: Optional[float] = None,
) -> np.ndarray:
    """
    Restrict an MFCC sequence to (a) frames inside [t_start, t_end] if given
    and (b) frames the F0 stage marked as voiced. Uses the same voicing mask
    pyin + RMS produced for pitch scoring, so silence and unvoiced consonants
    don't dominate the cepstral distance.

    Returns shape (T_kept, D). May be empty if no frames survive.
    """
    n = min(len(times), len(mfcc), len(f0_clean))
    if n == 0:
        return mfcc[:0]
    times = times[:n]
    mfcc = mfcc[:n]
    f0_clean = f0_clean[:n]

    if t_start is not None and t_end is not None:
        window = (times >= t_start) & (times <= t_end)
    else:
        window = np.ones(n, dtype=bool)
    voiced = ~np.isnan(f0_clean)
    keep = window & voiced
    return mfcc[keep]


# Pronunciation verdict thresholds in cosine-distance space (bounded [0, 2]).
# These assume Δ-MFCC features (12-D, no static) compared with cosine DTW.
# Δ-only is much more speaker-invariant than static MFCC, but cosine on
# 12-D feature vectors with smoothed deltas typically lives in a narrower
# band than 24-D static+Δ — different-content pairs sit ~0.6–0.8, same-word
# pairs across speakers cluster around 0.25–0.45.
#
# These thresholds are conservative on the green band so a real attempt
# from a voice quite different from the cantor still scores green when
# the transitions match. Calibrate by recording a few correct attempts
# and a few intentionally wrong ones, then move the boundaries.
PRONUNCIATION_GREEN = 0.45
PRONUNCIATION_YELLOW = 0.65

# Sanity check: if the student's voiced frame count for a word is wildly
# shorter than the cantor's, the student didn't really say the word, no
# matter what the cosine distance averages to. DTW will happily warp 5
# student frames against 50 cantor frames and find some low-cost path; this
# guard catches that case before the verdict is computed.
PRONUNCIATION_MIN_LENGTH_RATIO = 0.35


def score_pronunciation(
    student_mfcc_voiced: np.ndarray, ref_mfcc_voiced: np.ndarray
) -> dict:
    """
    Compute a pronunciation similarity score between two voiced-only feature
    sequences (CMN static MFCC + Δ MFCC, one per speaker, already restricted
    to the relevant word / aliya window).

    Returns a dict with:
      • distance — mean cosine distance along the DTW warp path, or None if
                   either side has too few frames to align.
      • verdict  — "green" / "yellow" / "red" / None on the thresholds above.

    The metric is a similarity-to-the-cantor score: it measures how closely
    the spectral trajectory of the student's recording follows the cantor's,
    which captures phoneme content reasonably well thanks to the delta
    features but still confounds voice timbre and chant-vs-speech delivery.
    Use as a coarse "did you say the right thing" signal, not phoneme-level
    diagnosis.
    """
    s_len = int(student_mfcc_voiced.shape[0])
    r_len = int(ref_mfcc_voiced.shape[0])
    if s_len < 2 or r_len < 2:
        return {"distance": None, "verdict": None}

    # Length-ratio guard. If the student's voiced span is well below the
    # cantor's, they almost certainly didn't pronounce the word — short or
    # silent attempts shouldn't sneak past on a small DTW cost.
    ratio = s_len / r_len if r_len > 0 else 0.0
    if ratio < PRONUNCIATION_MIN_LENGTH_RATIO:
        # Still report the distance for diagnostics, but force red.
        distance = _dtw_cepstral_distance(student_mfcc_voiced, ref_mfcc_voiced)
        if not np.isfinite(distance):
            return {"distance": None, "verdict": "red"}
        return {"distance": float(distance), "verdict": "red"}

    distance = _dtw_cepstral_distance(student_mfcc_voiced, ref_mfcc_voiced)

    if not np.isfinite(distance):
        return {"distance": None, "verdict": "red"}

    if distance <= PRONUNCIATION_GREEN:
        verdict = "green"
    elif distance <= PRONUNCIATION_YELLOW:
        verdict = "yellow"
    else:
        verdict = "red"

    return {"distance": float(distance), "verdict": verdict}


def trim_to_voiced(times: np.ndarray, semitones: np.ndarray) -> tuple:
    """
    Trim leading/trailing unvoiced (NaN) frames so the resampled contour
    actually shows the sung portion, not silence.
    """
    if len(times) == 0:
        return times, semitones
    voiced = ~np.isnan(semitones)
    if not voiced.any():
        return times, semitones
    first = int(np.argmax(voiced))
    last = len(voiced) - int(np.argmax(voiced[::-1])) - 1
    return times[first : last + 1], semitones[first : last + 1]


def remove_octave_jumps(
    semitones: np.ndarray,
    window: int = 5,
    max_jump_st: float = 5.0,
) -> np.ndarray:
    """
    Suppress local outliers in a semitone contour by Hampel-style filtering.

    Pyin (and any pitch tracker) occasionally locks onto a subharmonic for a
    few frames — typically on creaky-voice transitions, breath onsets, or
    low-energy held notes — producing a sudden downward spike of ~5–12
    semitones followed by a return to the regular contour. These are
    artefacts of the tracker, not real pitch motion. Without filtering they
    show up as anomalous dips in the cantor chart and inflate per-frame MAE
    against the student.

    For each voiced frame we look at a ±`window` neighbourhood of voiced
    frames; if the frame deviates from the local median by more than
    `max_jump_st` semitones we mark it NaN (= unvoiced). 5 ST is well below
    a real interval jump in chant (typically a half- or whole-step at a
    time) but well above the per-frame tracker noise (< 1 ST RMS), so
    real motifs survive untouched.

    Args:
        semitones: 1-D array of semitone values; NaN at unvoiced frames.
        window: Half-window size in frames. Total window = 2*window+1.
        max_jump_st: Threshold in semitones for "this is not local pitch."

    Returns:
        A new array with outlier frames replaced by NaN.
    """
    if semitones.size == 0:
        return semitones
    out = semitones.copy()
    n = out.size
    for i in range(n):
        if np.isnan(out[i]):
            continue
        lo = max(0, i - window)
        hi = min(n, i + window + 1)
        local = semitones[lo:hi]
        local_valid = local[~np.isnan(local)]
        if local_valid.size < 3:
            continue
        if abs(out[i] - float(np.median(local_valid))) > max_jump_st:
            out[i] = np.nan
    return out


def resample_contour_for_viz(
    times: np.ndarray, semitones: np.ndarray, n_points: int = 60
) -> list:
    """
    Resample a (times, semitones) contour to `n_points` evenly spaced over the
    voiced region. Returns a plain Python list with `None` for unvoiced /
    out-of-range points so the frontend can render gaps cleanly.

    Used for the side-by-side cantor-vs-student pitch overlay in the word drill
    modal — visual feedback, not used for scoring.
    """
    times, semitones = trim_to_voiced(times, semitones)
    if len(times) < 2:
        return [None] * n_points

    voiced = ~np.isnan(semitones)
    if voiced.sum() < 2:
        return [None] * n_points

    interp = interp1d(
        times[voiced],
        semitones[voiced],
        kind="linear",
        bounds_error=False,
        fill_value=np.nan,
    )
    grid = np.linspace(times[0], times[-1], n_points)
    out = interp(grid)
    return [
        None if (math.isnan(v) or math.isinf(v)) else float(v) for v in out
    ]


def f0_to_semitones(f0_hz: np.ndarray, reference_f0: float) -> np.ndarray:
    """
    Convert Hz to semitones relative to a reference frequency.

    Args:
        f0_hz: F0 values in Hz (0 or NaN for unvoiced)
        reference_f0: Reference frequency (tonic)

    Returns:
        Array of semitone values (NaN for unvoiced)
    """
    semitones = np.full_like(f0_hz, np.nan, dtype=float)
    voiced = f0_hz > 0
    semitones[voiced] = 12 * np.log2(f0_hz[voiced] / reference_f0)
    return semitones


def simple_alignment(ref_semitones: np.ndarray, student_semitones: np.ndarray) -> tuple:
    """
    Simple time-stretching alignment using cross-correlation.

    This is a simplified version of DTW that works well for similar-paced recordings.

    Args:
        ref_semitones: Reference f0 contour
        student_semitones: Student f0 contour

    Returns:
        (ref_indices, student_indices): Aligned indices for both arrays
    """
    # Remove NaNs for alignment purposes
    ref_valid = ~np.isnan(ref_semitones)
    student_valid = ~np.isnan(student_semitones)

    if not ref_valid.any() or not student_valid.any():
        # If either is all unvoiced, do linear mapping
        ref_indices = np.arange(len(ref_semitones))
        student_indices = np.linspace(0, len(student_semitones) - 1, len(ref_semitones))
        return ref_indices, student_indices

    # Resample to same length for simple alignment
    min_len = min(len(ref_semitones), len(student_semitones))
    return np.arange(min_len), np.arange(min_len)


def load_word_boundaries(
    aliya_num: str,
    parasha: str,
    override_path: Optional[str] = None,
) -> list:
    """
    Load word timing boundaries from the aliya JSON file.

    Args:
        aliya_num: Aliya number (1-7)
        parasha: Parasha name (e.g. 'Miketz')
        override_path: Optional explicit path to a per-cantor aliya JSON
            (e.g. public/parasha/miketz/alt/aliya1.json). When provided,
            this is used instead of the default-cantor JSON. Used to score
            students against an alternate cantor whose word boundaries
            were aligned by scripts/align_cantor.py.

    Returns:
        List of (start_time, end_time, word_idx) tuples
    """
    import json as json_lib

    if override_path:
        json_path = Path(override_path)
    else:
        json_path = Path(__file__).parent.parent / (
            f"public/parasha/{parasha.lower()}/aliya{aliya_num}.json"
        )

    if not json_path.exists():
        # Fall back to approximate boundaries based on duration
        return []

    try:
        with open(json_path) as f:
            data = json_lib.load(f)

        boundaries = []
        word_idx = 0

        for verse in data.get("verses", []):
            for word in verse.get("words", []):
                boundaries.append(
                    (word["start"], word["end"], word_idx, word.get("text", ""))
                )
                word_idx += 1

        return boundaries
    except Exception as e:
        print(f"Warning: Failed to load word boundaries: {e}", file=sys.stderr)
        return []


def _resample_voiced(
    times: np.ndarray, semis: np.ndarray, n: int
) -> np.ndarray:
    """
    Linear-resample a (times, semitones) contour to `n` evenly spaced frames
    over its voiced span. Trims leading/trailing unvoiced frames first so
    frame 0 of the output corresponds to voicing onset, not the raw
    word-boundary start. Returns NaN frames for any internal gaps the linear
    interp can't reach.
    """
    times, semis = trim_to_voiced(times, semis)
    if len(times) < 2:
        return np.full(n, np.nan, dtype=float)

    valid = ~np.isnan(semis)
    if valid.sum() < 2:
        return np.full(n, np.nan, dtype=float)

    f = interp1d(
        times[valid],
        semis[valid],
        kind="linear",
        bounds_error=False,
        fill_value=np.nan,
    )
    return f(np.linspace(times[0], times[-1], n))


def _dtw_mae(student_resampled: np.ndarray, ref_resampled: np.ndarray) -> float:
    """
    Mean absolute error between two semitone contours after DTW alignment.

    Both inputs are 1-D arrays of equal length (already voiced-trimmed +
    linear-resampled). DTW finds the lowest-cost monotonic warp path between
    them so a slight rubato or onset jitter inside the word doesn't get
    charged as pitch error. Falls back to straight per-index MAE if librosa's
    DTW is unavailable or the arrays are too sparse to align.
    """
    s_mask = ~np.isnan(student_resampled)
    r_mask = ~np.isnan(ref_resampled)
    if s_mask.sum() < 2 or r_mask.sum() < 2:
        # Not enough voiced overlap to align; fall back to index MAE.
        m = s_mask & r_mask
        if not m.any():
            return float("inf")
        return float(np.mean(np.abs(student_resampled[m] - ref_resampled[m])))

    # librosa.sequence.dtw can't ingest NaN. Substitute the per-side mean so
    # padded frames don't dominate the warp cost — the warp path will simply
    # park them against the cheapest neighbour.
    s_fill = float(np.mean(student_resampled[s_mask]))
    r_fill = float(np.mean(ref_resampled[r_mask]))
    s_seq = np.where(s_mask, student_resampled, s_fill).reshape(1, -1)
    r_seq = np.where(r_mask, ref_resampled, r_fill).reshape(1, -1)

    try:
        _D, wp = librosa.sequence.dtw(X=s_seq, Y=r_seq, metric="euclidean")
    except Exception:
        # Fallback to straight index MAE if DTW blows up (e.g. all-equal seq).
        m = s_mask & r_mask
        if not m.any():
            return float("inf")
        return float(np.mean(np.abs(student_resampled[m] - ref_resampled[m])))

    # wp is shape (path_len, 2) running end→start; per-step it's [s_idx, r_idx].
    s_idx = wp[:, 0]
    r_idx = wp[:, 1]
    s_along = student_resampled[s_idx]
    r_along = ref_resampled[r_idx]
    along_mask = ~(np.isnan(s_along) | np.isnan(r_along))
    if not along_mask.any():
        return float("inf")
    return float(np.mean(np.abs(s_along[along_mask] - r_along[along_mask])))


def score_word(
    student_samples: list, ref_samples: list, mae_threshold_green: float = 2.0, mae_threshold_yellow: float = 4.0
) -> dict:
    """
    Score a single word's pitch accuracy.

    Both contours are first trimmed to their voiced span (so leading/trailing
    silence or unvoiced consonants don't shift the time axis), linearly
    resampled to a common length, and finally DTW-aligned before computing
    mean absolute error in semitones. The trim-then-DTW combo is what makes
    the score robust to:
      • dead air at the start of the student recording (tap-record-then-sing
        latency, leading "v"/"sh"/"l" consonant frames pyin marks unvoiced)
      • dead air at the end (release / breath)
      • mild tempo differences inside the word (rubato, sustained vowels)

    Args:
        student_samples: List of (time, semitone) tuples for student
        ref_samples: List of (time, semitone) tuples for reference
        mae_threshold_green: MAE threshold for 'green' verdict
        mae_threshold_yellow: MAE threshold for 'yellow' verdict

    Returns:
        Dict with mae, verdict, student_duration, etc.
    """
    if not student_samples or not ref_samples:
        return {
            "mae": float("inf"),
            "verdict": "red",
            "student_duration": 0,
            "reference_duration": 0,
        }

    # Extract arrays
    student_times = np.array([s[0] for s in student_samples])
    student_semis = np.array([s[1] for s in student_samples])
    ref_times = np.array([s[0] for s in ref_samples])
    ref_semis = np.array([s[1] for s in ref_samples])

    # Voiced-trim each side independently so the duration we report matches
    # the actually-sung region rather than the raw recording / boundary span.
    stu_t_voiced, stu_s_voiced = trim_to_voiced(student_times, student_semis)
    ref_t_voiced, ref_s_voiced = trim_to_voiced(ref_times, ref_semis)

    student_duration = (
        float(stu_t_voiced[-1] - stu_t_voiced[0]) if len(stu_t_voiced) >= 2 else 0.0
    )
    ref_duration = (
        float(ref_t_voiced[-1] - ref_t_voiced[0]) if len(ref_t_voiced) >= 2 else 0.0
    )

    # Resample both to a common frame count for index-aligned comparison.
    # 40 frames gives DTW more room to warp than the old N=20 without making
    # the cost matrix expensive on a one-second clip.
    N = 40

    student_resampled = _resample_voiced(student_times, student_semis, N)
    ref_resampled = _resample_voiced(ref_times, ref_semis, N)

    if np.isnan(student_resampled).all() or np.isnan(ref_resampled).all():
        return {
            "mae": float("inf"),
            "verdict": "red",
            "student_duration": student_duration,
            "reference_duration": ref_duration,
        }

    mae = _dtw_mae(student_resampled, ref_resampled)

    # Determine verdict
    if not np.isfinite(mae):
        verdict = "red"
    elif mae <= mae_threshold_green:
        verdict = "green"
    elif mae <= mae_threshold_yellow:
        verdict = "yellow"
    else:
        verdict = "red"

    return {
        "mae": float(mae),
        "verdict": verdict,
        "student_duration": float(student_duration),
        "reference_duration": float(ref_duration),
    }


def _parse_args(argv: list) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Score Hebrew chanting against a cantor reference."
    )
    parser.add_argument("student_wav")
    parser.add_argument("reference_mp3")
    parser.add_argument("aliya_num")
    parser.add_argument("parasha")
    parser.add_argument(
        "--word",
        type=int,
        default=None,
        help=(
            "Word-drill mode: only score this word index. The student "
            "recording is assumed to be JUST that word."
        ),
    )
    # Segment scoping. The student recorded the cantor's [seg_start, seg_end]
    # window, so the recording starts at t=0 corresponding to seg_start in
    # the cantor's reference. We shift student frame times by +seg_start
    # before masking against word boundaries (which live in cantor time) and
    # only score words whose [start, end] lie inside the segment.
    parser.add_argument(
        "--seg-start",
        type=float,
        default=None,
        help="Cantor-time start of the segment the student recorded (s).",
    )
    parser.add_argument(
        "--seg-end",
        type=float,
        default=None,
        help="Cantor-time end of the segment the student recorded (s).",
    )
    parser.add_argument(
        "--word-start",
        type=int,
        default=None,
        help=(
            "Inclusive flat-word index for the first word in the segment. "
            "Used as a redundant sanity check on --seg-start/--seg-end."
        ),
    )
    parser.add_argument(
        "--word-end",
        type=int,
        default=None,
        help="Inclusive flat-word index for the last word in the segment.",
    )
    # Cantor selection. When the student is scoring against a non-default
    # cantor, the route passes the alt cantor's per-aliya JSON path (with
    # alt-time word boundaries) and a unique cache key so we don't
    # cross-contaminate the on-disk F0/MFCC caches between cantors.
    parser.add_argument(
        "--words-json",
        type=str,
        default=None,
        help=(
            "Override path to the aliya JSON whose word boundaries should "
            "be used (defaults to public/parasha/<parasha>/aliya<N>.json). "
            "Pass the alt cantor's aligned JSON when scoring against an "
            "alternate cantor."
        ),
    )
    parser.add_argument(
        "--ref-cache-key",
        type=str,
        default=None,
        help=(
            "Override the on-disk F0/MFCC cache key used for the reference "
            "audio. Different cantors must use distinct keys, otherwise the "
            "cache will thrash — first call writes default, second writes "
            "alt, repeat. Defaults to <parasha>_aliya<N>."
        ),
    )
    return parser.parse_args(argv)


def _emit_error(msg: str, code: int = 1) -> None:
    print(json.dumps({"status": "error", "error": msg}), file=sys.stderr)
    sys.exit(code)


def _run_word_mode(
    student_path: str,
    ref_path: str,
    aliya_num: str,
    parasha: str,
    word_idx: int,
    words_json_override: Optional[str] = None,
    ref_cache_key_override: Optional[str] = None,
) -> None:
    """
    Score a single word and emit contours for visualization.

    The student recording is treated as one whole word: we run pyin on it,
    pull the reference's slice for that word from the cached F0, normalize
    each speaker to their own tonic, and feed both into score_word(). The
    contours are resampled to a fixed length so the frontend can plot them
    on the same x-axis.
    """
    student_f0, student_times, sr, hop_length = extract_f0(student_path)
    ref_cache_key = (
        ref_cache_key_override
        if ref_cache_key_override
        else f"{parasha.lower()}_aliya{aliya_num}"
    )
    ref_f0, ref_times, _, _ = extract_f0_cached(
        ref_path, cache_key=ref_cache_key, sr=sr, hop_length=hop_length
    )

    # Pronunciation features: same hop/sr so frames align with the F0 voicing
    # mask. Cantor side is cached on disk; student side is short and unique.
    student_mfcc, student_mfcc_times = extract_mfcc(
        student_path, sr=sr, hop_length=hop_length
    )
    ref_mfcc, ref_mfcc_times = extract_mfcc_cached(
        ref_path, cache_key=ref_cache_key, sr=sr, hop_length=hop_length
    )

    boundaries = load_word_boundaries(
        aliya_num, parasha, override_path=words_json_override
    )
    if not boundaries:
        _emit_error(
            f"No word boundaries available for {parasha} aliya {aliya_num}"
        )
        return

    match = next((b for b in boundaries if int(b[2]) == word_idx), None)
    if match is None:
        _emit_error(
            f"Word index {word_idx} out of range (have {len(boundaries)} words)"
        )
        return
    word_start, word_end, _wi, word_text = match

    # Cantor tonic = median over the WHOLE aliya. That's a long, well-voiced
    # signal so the median is stable and reflects the cantor's register.
    ref_voiced_all = ref_f0[ref_f0 > 0]
    reference_tonic_hz = (
        float(np.median(ref_voiced_all)) if len(ref_voiced_all) > 0 else 100.0
    )

    # Student tonic = median over the voiced-trimmed slice of the recording
    # only. The full recording is short and tap-record-then-sing latency
    # plus inevitable mic noise (mains hum, fan, room tone) means the
    # leading/trailing seconds can contribute frames pyin marks voiced at
    # ~60–80 Hz. Including those drags the median below the singer's actual
    # register and the per-speaker normalization stops working — every word
    # then scores ~12–19 semitones off regardless of pitch accuracy.
    stu_voiced_times, stu_voiced_f0 = trim_to_voiced(student_times, student_f0)
    student_voiced_in_word = stu_voiced_f0[stu_voiced_f0 > 0]
    if len(student_voiced_in_word) > 0:
        student_tonic_hz = float(np.median(student_voiced_in_word))
    else:
        # No usable voiced frames after gating — fall back to the cantor's
        # tonic so at least the absolute-pitch case is consistent.
        student_tonic_hz = reference_tonic_hz

    student_semitones = f0_to_semitones(student_f0, student_tonic_hz)
    ref_semitones = f0_to_semitones(ref_f0, reference_tonic_hz)

    # Suppress pyin's occasional subharmonic / octave-down spikes. Done after
    # tonic normalization so the threshold is in musical semitones (interval
    # space) and applies symmetrically to either speaker.
    student_semitones = remove_octave_jumps(student_semitones)
    ref_semitones = remove_octave_jumps(ref_semitones)

    # Reference word slice
    ref_mask = (ref_times >= word_start) & (ref_times <= word_end)
    ref_word_times = ref_times[ref_mask]
    ref_word_semis = ref_semitones[ref_mask]

    # Trim BOTH sides to their voiced span. Without this, leading silence or
    # an unvoiced consonant on either side phase-shifts the linear time-stretch
    # alignment: the cantor's `[word_start, word_end]` slice typically begins a
    # few frames *before* voicing onset (a "v"/"sh"/"l" consonant or a hop
    # boundary), while the student's recording was already trimmed — comparing
    # them frame-by-frame then mismatches the vowel onsets and produces a
    # phantom 5–7-frame offset on the overlay and inflated MAE.
    stu_trim_times, stu_trim_semis = trim_to_voiced(
        student_times, student_semitones
    )
    ref_trim_times, ref_trim_semis = trim_to_voiced(
        ref_word_times, ref_word_semis
    )

    student_samples = list(zip(stu_trim_times, stu_trim_semis))
    ref_samples = list(zip(ref_trim_times, ref_trim_semis))
    score = score_word(student_samples, ref_samples)
    score["wordIdx"] = int(word_idx)
    score["startTime"] = float(word_start)
    score["endTime"] = float(word_end)
    score["attempted"] = True

    # Pronunciation similarity. Student recording is the whole word, so we
    # don't time-window the student side; the cantor side is sliced to this
    # word's [start,end]. Both are restricted to F0-voiced frames so the
    # cepstral distance reflects sung syllables, not silence/breath.
    student_mfcc_voiced = _voiced_window_mfcc(
        student_mfcc_times, student_mfcc, student_f0
    )
    ref_mfcc_voiced = _voiced_window_mfcc(
        ref_mfcc_times, ref_mfcc, ref_f0, t_start=word_start, t_end=word_end
    )
    pronunciation = score_pronunciation(student_mfcc_voiced, ref_mfcc_voiced)
    score["pronunciation"] = pronunciation

    result = {
        "status": "success",
        "mode": "word",
        "aliya_num": int(aliya_num),
        "parasha": parasha,
        "word_idx": int(word_idx),
        "word_text": word_text,
        "tonic_hz": reference_tonic_hz,
        "reference_tonic_hz": reference_tonic_hz,
        "student_tonic_hz": student_tonic_hz,
        "word_score": score,
        # Contours for the side-by-side overlay. Both resampled to the same
        # length so the frontend just needs to map index → x-axis.
        # We pass the already-voiced-trimmed series on both sides so frame 0
        # of each contour lines up with vowel onset, not the raw recording or
        # word-boundary start.
        "reference_contour": resample_contour_for_viz(
            ref_trim_times, ref_trim_semis
        ),
        "student_contour": resample_contour_for_viz(
            stu_trim_times, stu_trim_semis
        ),
    }
    print(json.dumps(_sanitize_for_json(result), indent=2, allow_nan=False))


def main():
    args = _parse_args(sys.argv[1:])
    student_path = args.student_wav
    ref_path = args.reference_mp3
    aliya_num = args.aliya_num
    parasha = args.parasha

    if args.word is not None:
        try:
            _run_word_mode(
                student_path,
                ref_path,
                aliya_num,
                parasha,
                args.word,
                words_json_override=args.words_json,
                ref_cache_key_override=args.ref_cache_key,
            )
        except Exception as e:
            _emit_error(str(e))
        return

    # Segment mode: the student recorded a slice [seg_start, seg_end] of the
    # cantor's reference (in cantor time), so the student's frame at t=0
    # corresponds to seg_start in the cantor's audio. We add `student_offset`
    # to student frame times before masking against cantor-space word
    # boundaries, and we filter the word list down to the segment's words so
    # roll-up scores only reflect the recorded slice.
    seg_mode = (
        args.seg_start is not None
        and args.seg_end is not None
        and args.seg_end > args.seg_start
    )
    student_offset = float(args.seg_start) if seg_mode else 0.0
    seg_start_t = float(args.seg_start) if seg_mode else None
    seg_end_t = float(args.seg_end) if seg_mode else None

    try:
        # Extract F0 from both audio files. The student is unique per request,
        # so always recompute. The reference (cantor mp3) is the same every
        # request for a given (parasha, aliya), so cache it on disk — pyin on
        # a multi-minute aliya is the dominant cost and would otherwise blow
        # past the route's timeout on every call.
        student_f0, student_times, sr, hop_length = extract_f0(student_path)
        # Effective student frame times in cantor-reference coordinates. Used
        # only for boundary masking; the original student_times still drives
        # tonic estimation, contour resampling, and the reported recording
        # duration (which should reflect the actual blob, not where it lives
        # inside the aliya).
        student_times_eff = student_times + student_offset
        student_mfcc_times_eff_offset = student_offset
        ref_cache_key = (
            args.ref_cache_key
            if args.ref_cache_key
            else f"{parasha.lower()}_aliya{aliya_num}"
        )
        ref_f0, ref_times, _, _ = extract_f0_cached(
            ref_path, cache_key=ref_cache_key, sr=sr, hop_length=hop_length
        )

        # Pronunciation features for cantor and student. Frame grid matches
        # the F0 grid (same sr, hop), so we can reuse F0's voicing decisions
        # to mask MFCC frames.
        student_mfcc, student_mfcc_times = extract_mfcc(
            student_path, sr=sr, hop_length=hop_length
        )
        ref_mfcc, ref_mfcc_times = extract_mfcc_cached(
            ref_path, cache_key=ref_cache_key, sr=sr, hop_length=hop_length
        )

        # Estimate a tonic for each speaker independently from their own
        # voiced frames (median). This is critical: trope is judged by melodic
        # *shape*, not absolute pitch. If we used the cantor's tonic for both
        # speakers, a student singing an octave lower would show a constant
        # ~12-semitone offset on every word and score red everywhere even if
        # their melody is perfect.
        ref_voiced = ref_f0[ref_f0 > 0]
        if len(ref_voiced) > 0:
            reference_tonic_hz = float(np.median(ref_voiced))
        else:
            reference_tonic_hz = 100.0

        # Student tonic from the voiced-trimmed slice only (see _run_word_mode
        # for the full justification — leading silence + mains hum bias the
        # whole-recording median toward 60 Hz).
        _stu_v_times, stu_v_f0 = trim_to_voiced(student_times, student_f0)
        student_voiced = stu_v_f0[stu_v_f0 > 0]
        if len(student_voiced) > 0:
            student_tonic_hz = float(np.median(student_voiced))
        else:
            # Fall back to reference tonic if the student recording has no
            # voiced frames (silence / very noisy). Score will be junk
            # either way in that case.
            student_tonic_hz = reference_tonic_hz

        # Convert each contour to semitones relative to its own tonic. Now
        # comparing them measures "did the student deviate from their tonic
        # the same way the cantor deviated from theirs," i.e. melodic shape.
        student_semitones = f0_to_semitones(student_f0, student_tonic_hz)
        ref_semitones = f0_to_semitones(ref_f0, reference_tonic_hz)

        # Strip pyin's subharmonic-tracking spikes from both contours before
        # any per-word slicing or chart resampling. See remove_octave_jumps
        # for the full rationale; without this the cantor reference shows
        # ~5–8 ST downward spikes a few times per aliya that look like
        # anomalies in the chart and pull the MAE up unfairly.
        student_semitones = remove_octave_jumps(student_semitones)
        ref_semitones = remove_octave_jumps(ref_semitones)

        # Load word boundaries
        word_boundaries = load_word_boundaries(
            aliya_num, parasha, override_path=args.words_json
        )

        # In segment mode, restrict the word list to those that fall inside
        # [seg_start, seg_end]. A small grace (50 ms) on each side absorbs
        # rounding from the frontend's phrase boundaries, which come from
        # cantillation labels that don't always sit precisely on syllable
        # edges.
        if seg_mode and word_boundaries:
            grace = 0.05
            word_boundaries = [
                wb
                for wb in word_boundaries
                if wb[0] >= (seg_start_t - grace)
                and wb[1] <= (seg_end_t + grace)
            ]
            # If --word-start / --word-end were also passed, double-check
            # against them; intersect the two filters when both are
            # available so a slightly off seg time can't pull in extra
            # words and a slightly tight word range can't drop in-segment
            # words. Use the looser (union) result so we don't silently
            # drop a real word.
            if args.word_start is not None and args.word_end is not None:
                wb_by_idx = {wb[2]: wb for wb in word_boundaries}
                # Add any words from the index range that fell outside the
                # time filter (rare, but happens with very tight grace).
                # We need the full original list to look these up.
                full = load_word_boundaries(
                    aliya_num, parasha, override_path=args.words_json
                )
                for wb in full:
                    if (
                        args.word_start <= int(wb[2]) <= args.word_end
                        and int(wb[2]) not in wb_by_idx
                    ):
                        wb_by_idx[int(wb[2])] = wb
                word_boundaries = sorted(
                    wb_by_idx.values(), key=lambda x: int(x[2])
                )

        # Score each word
        word_scores = []

        # How far into the aliya the student actually sang. In segment mode
        # the student's recording starts at t=0 = seg_start in cantor time,
        # so the cutoff is shifted by student_offset.
        student_end_time = (
            float(student_times[-1]) if len(student_times) > 0 else 0.0
        )
        # Small grace window so a word that ends a hair past the recording
        # is still scored on what we have.
        attempted_cutoff = student_end_time + student_offset + 0.25

        if word_boundaries:
            # Use actual word boundaries from JSON
            for start_time, end_time, word_idx, word_text in word_boundaries:
                if start_time >= attempted_cutoff:
                    # Student stopped before reaching this word.
                    word_scores.append(
                        {
                            "wordIdx": int(word_idx),
                            "startTime": float(start_time),
                            "endTime": float(end_time),
                            "mae": None,
                            "verdict": None,
                            "attempted": False,
                            "student_duration": 0.0,
                            "reference_duration": float(end_time - start_time),
                            "pronunciation": {
                                "distance": None,
                                "verdict": None,
                            },
                        }
                    )
                    continue

                # Extract samples within this word's time range. In segment
                # mode student_times_eff = student_times + seg_start lives in
                # cantor coordinates, so the same word boundary works for both
                # sides. The reported sample times use the cantor-space form
                # too — score_word never inspects absolute time, only the
                # voiced sub-span and shape.
                student_mask = (student_times_eff >= start_time) & (
                    student_times_eff <= end_time
                )
                ref_mask = (ref_times >= start_time) & (ref_times <= end_time)

                student_samples = list(
                    zip(
                        student_times_eff[student_mask],
                        student_semitones[student_mask],
                    )
                )
                ref_samples = list(
                    zip(ref_times[ref_mask], ref_semitones[ref_mask])
                )

                score = score_word(student_samples, ref_samples)
                score["wordIdx"] = int(word_idx)
                score["startTime"] = float(start_time)
                score["endTime"] = float(end_time)
                score["attempted"] = True

                # Pronunciation: window both sides to [start_time, end_time]
                # and keep only voiced frames. The student's MFCC frame times
                # need the same offset shift as F0 so the window picks up the
                # right slice when in segment mode.
                stu_mfcc_word = _voiced_window_mfcc(
                    student_mfcc_times + student_mfcc_times_eff_offset,
                    student_mfcc,
                    student_f0,
                    t_start=start_time,
                    t_end=end_time,
                )
                ref_mfcc_word = _voiced_window_mfcc(
                    ref_mfcc_times,
                    ref_mfcc,
                    ref_f0,
                    t_start=start_time,
                    t_end=end_time,
                )
                score["pronunciation"] = score_pronunciation(
                    stu_mfcc_word, ref_mfcc_word
                )

                word_scores.append(score)
        else:
            # Fall back to splitting evenly
            # Divide the reference time into approximately equal chunks
            ref_duration = ref_times[-1]
            num_words = 50  # Estimate (will be overridden by actual counts)

            for i in range(num_words):
                start_time = (i / num_words) * ref_duration
                end_time = ((i + 1) / num_words) * ref_duration

                student_mask = (student_times >= start_time) & (
                    student_times <= end_time
                )
                ref_mask = (ref_times >= start_time) & (ref_times <= end_time)

                if not student_mask.any() or not ref_mask.any():
                    continue

                student_samples = list(
                    zip(student_times[student_mask], student_semitones[student_mask])
                )
                ref_samples = list(
                    zip(ref_times[ref_mask], ref_semitones[ref_mask])
                )

                score = score_word(student_samples, ref_samples)
                score["wordIdx"] = i
                score["startTime"] = float(start_time)
                score["endTime"] = float(end_time)
                score["attempted"] = True

                stu_mfcc_word = _voiced_window_mfcc(
                    student_mfcc_times,
                    student_mfcc,
                    student_f0,
                    t_start=start_time,
                    t_end=end_time,
                )
                ref_mfcc_word = _voiced_window_mfcc(
                    ref_mfcc_times,
                    ref_mfcc,
                    ref_f0,
                    t_start=start_time,
                    t_end=end_time,
                )
                score["pronunciation"] = score_pronunciation(
                    stu_mfcc_word, ref_mfcc_word
                )

                word_scores.append(score)

        # Aliya-level pitch contours for the side-by-side overlay on the
        # results card. Each contour is voiced-trimmed (so leading/trailing
        # silence doesn't show up as a flat line) and resampled to a fixed
        # length, with the student's points spread across the same x-axis as
        # the cantor's. The student's contour ends naturally where their
        # voiced span ends — words past that aren't drawn.
        if seg_mode:
            # Segment mode: only render the part of the cantor that the
            # student was actually meant to re-sing. Mask to [seg_start,
            # seg_end] for the cantor (cantor time) and use the whole
            # student recording (which already maps onto that span).
            ref_seg_mask = (ref_times >= seg_start_t) & (ref_times <= seg_end_t)
            ref_contour_full = resample_contour_for_viz(
                ref_times[ref_seg_mask],
                ref_semitones[ref_seg_mask],
                n_points=300,
            )
        else:
            ref_contour_full = resample_contour_for_viz(
                ref_times, ref_semitones, n_points=300
            )
        student_contour_full = resample_contour_for_viz(
            student_times, student_semitones, n_points=300
        )

        # Aggregate recording-level score. The per-word verdicts already tell
        # the user where they were on/off; this rolls them up into a single
        # number so they can track progress over time. Three pieces:
        #   • overall_mae  = mean MAE across attempted words, weighted by the
        #                    cantor's word duration so a 4-syllable word
        #                    counts more than a one-syllable word.
        #   • overall_score = 0–100, derived from MAE on the same scale as
        #                     the per-word verdicts (0 ST = 100, ≥6 ST = 0)
        #                     so the number is intuitive and stable across
        #                     different aliya lengths.
        #   • overall_verdict = green/yellow/red on the same thresholds as
        #                       per-word, for a single colored badge on the
        #                       card.
        # Coverage is reported separately (attempted / total words) — a user
        # who sang half the aliya perfectly shouldn't get the same score as
        # one who sang the whole thing perfectly.
        attempted_with_mae = [
            s for s in word_scores
            if s.get("attempted")
            and s.get("mae") is not None
            and math.isfinite(float(s["mae"]))
        ]
        total_word_count = len(word_scores)
        attempted_count = len([s for s in word_scores if s.get("attempted")])

        if attempted_with_mae:
            maes = np.array([float(s["mae"]) for s in attempted_with_mae])
            weights = np.array(
                [
                    max(1e-3, float(s.get("reference_duration") or 0.0))
                    for s in attempted_with_mae
                ]
            )
            if weights.sum() > 0:
                overall_mae = float(np.average(maes, weights=weights))
            else:
                overall_mae = float(np.mean(maes))
            # Linear MAE→score: 0 ST = 100, 6 ST = 0. Clamped at both ends.
            score_from_mae = 100.0 - (overall_mae / 6.0) * 100.0
            overall_score = float(max(0.0, min(100.0, score_from_mae)))
            if overall_mae <= 2.0:
                overall_verdict = "green"
            elif overall_mae <= 4.0:
                overall_verdict = "yellow"
            else:
                overall_verdict = "red"
        else:
            overall_mae = None
            overall_score = 0.0
            overall_verdict = "red"

        coverage_pct = (
            int(round(100 * attempted_count / total_word_count))
            if total_word_count > 0
            else 0
        )

        # Aliya-level pronunciation roll-up. Same shape as the pitch roll-up:
        # weight per-word distances by the cantor's word duration so longer
        # words count more, then map the weighted-mean distance to a 0-100
        # score and a green/yellow/red verdict on the pronunciation thresholds.
        attempted_with_pron = [
            s for s in word_scores
            if s.get("attempted")
            and isinstance(s.get("pronunciation"), dict)
            and s["pronunciation"].get("distance") is not None
            and math.isfinite(float(s["pronunciation"]["distance"]))
        ]
        if attempted_with_pron:
            dists = np.array(
                [float(s["pronunciation"]["distance"]) for s in attempted_with_pron]
            )
            weights = np.array(
                [
                    max(1e-3, float(s.get("reference_duration") or 0.0))
                    for s in attempted_with_pron
                ]
            )
            if weights.sum() > 0:
                overall_pron_distance = float(np.average(dists, weights=weights))
            else:
                overall_pron_distance = float(np.mean(dists))
            # Map distance → 0-100. PRONUNCIATION_GREEN ≈ "near-perfect" so 100,
            # 2 × PRONUNCIATION_YELLOW ≈ "off" so 0. Linear in between, clamped.
            zero_score_distance = PRONUNCIATION_YELLOW * 2.0
            span = max(1e-6, zero_score_distance - PRONUNCIATION_GREEN)
            pron_score_raw = 100.0 * (
                1.0 - (overall_pron_distance - PRONUNCIATION_GREEN) / span
            )
            overall_pronunciation_score = float(
                max(0.0, min(100.0, pron_score_raw))
            )
            if overall_pron_distance <= PRONUNCIATION_GREEN:
                overall_pronunciation_verdict = "green"
            elif overall_pron_distance <= PRONUNCIATION_YELLOW:
                overall_pronunciation_verdict = "yellow"
            else:
                overall_pronunciation_verdict = "red"
        else:
            overall_pron_distance = None
            overall_pronunciation_score = 0.0
            overall_pronunciation_verdict = "red"

        # Build result. Keep the legacy `tonic_hz` field (= reference tonic)
        # for backward compat with the existing UI; also expose the per-
        # speaker tonics explicitly so the UI can show both later. In
        # segment mode `reference_duration` is the segment length (so the
        # results card's speed-ratio is meaningful for the slice the student
        # actually attempted).
        reference_duration_value = (
            float(seg_end_t - seg_start_t)
            if seg_mode and seg_start_t is not None and seg_end_t is not None
            else float(ref_times[-1])
        )
        result = {
            "status": "success",
            "aliya_num": int(aliya_num),
            "parasha": parasha,
            "tonic_hz": reference_tonic_hz,
            "reference_tonic_hz": reference_tonic_hz,
            "student_tonic_hz": student_tonic_hz,
            "student_duration": float(student_times[-1]),
            "reference_duration": reference_duration_value,
            "word_scores": word_scores,
            "reference_contour": ref_contour_full,
            "student_contour": student_contour_full,
            "overall_mae": overall_mae,
            "overall_score": overall_score,
            "overall_verdict": overall_verdict,
            "overall_pronunciation_distance": overall_pron_distance,
            "overall_pronunciation_score": overall_pronunciation_score,
            "overall_pronunciation_verdict": overall_pronunciation_verdict,
            "attempted_words": int(attempted_count),
            "total_words": int(total_word_count),
            "coverage_pct": int(coverage_pct),
            "segment_mode": bool(seg_mode),
            "segment_start": (
                float(seg_start_t) if seg_mode and seg_start_t is not None else None
            ),
            "segment_end": (
                float(seg_end_t) if seg_mode and seg_end_t is not None else None
            ),
        }

        # Strict JSON only — convert any NaN/Inf to null so JSON.parse on the
        # frontend doesn't choke on Python's default Infinity output.
        print(json.dumps(_sanitize_for_json(result), indent=2, allow_nan=False))

    except Exception as e:
        error_result = {"status": "error", "error": str(e)}
        print(json.dumps(error_result), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

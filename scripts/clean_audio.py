#!/usr/bin/env python3
"""
Clean cantor recordings: remove background noise (hum, hiss, room tone)
and tame room reverb while preserving speech/singing.

Pipeline (all done by ffmpeg, so no extra Python deps beyond stdlib):

  1. Mono downmix          - cantor is one voice; stereo just doubles noise.
  2. High-pass at 80 Hz    - kills 50/60 Hz mains hum and sub-vocal rumble.
  3. afftdn                - FFT spectral denoiser with adaptive noise
                             tracking (tn=1). Removes hiss / room tone
                             without needing a hand-picked noise profile.
  4. anlmdn                - non-local-means broadband denoiser, mops up
                             residuals from step 3 with minimal artifacts.
  5. compand expander      - downward expander shaped so anything below
                             ~-45 dBFS gets pulled toward -90 dB. This is
                             the reverb-tail killer: speech levels (~-15
                             dBFS) are untouched, but the long reverberant
                             tail between phrases is suppressed.
  6. loudnorm (EBU R128)   - normalise to I=-16 LUFS / TP=-1.5 / LRA=11
                             (podcast loudness target).
  7. libmp3lame -b:a 128k  - re-encode to 128 kbps CBR mp3 to match the
                             original file format.

Usage:
    python3 scripts/clean_audio.py <input.mp3> [output.mp3]

If output is omitted, writes <input>.cleaned.mp3 next to the input.
Use --in-place to overwrite the input (a backup is written to
<dir>/.originals/<filename> if not already present).
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path


# ffmpeg filter chain. Tweak the knobs in the comments if it's too
# aggressive or too soft.
#
# The chain is built so that anywhere the cantor isn't actively singing
# becomes true silence, not "quieter noise". The trick is two stages:
#   - spectral denoise (afftdn x2, anlmdn) pulls the noise floor down to
#     ~-50 dBFS by removing hiss / room tone in the frequency domain;
#   - agate then hard-gates anything below ~-32 dBFS to actual zero so
#     the residual noise floor between phrases disappears.
FILTER_CHAIN = ",".join(
    [
        # Mono downmix - cantor is one voice; stereo doubles the noise.
        "pan=mono|c0=0.5*c0+0.5*c1",
        # 80 Hz high-pass: rolls off 50/60 Hz mains hum and rumble.
        "highpass=f=80:poles=2",
        # 10 kHz low-pass: cantor harmonics top out around 8 kHz; everything
        # above ~10 kHz is mic hiss and room noise.
        "lowpass=f=10000:poles=2",
        # First-pass FFT spectral denoise with adaptive noise tracking.
        #   nr = reduction depth in dB (was 20, now 30 for more bite)
        #   nf = noise floor estimate in dB; lower = more aggressive
        #   nt = w (white-noise model) handles hum + hiss residual
        #   tn = 1 tracks noise dynamically; no profile needed
        "afftdn=nr=30:nf=-25:nt=w:tn=1",
        # Non-local-means broadband cleanup. Catches what afftdn missed
        # without the spectral artifacts NR can leave behind.
        "anlmdn=s=7:p=0.004:r=0.01",
        # Second-pass afftdn at lower depth - removes residual musical
        # noise / "watery" artifacts left by the first pass.
        "afftdn=nr=12:nf=-40:nt=w:tn=1",
        # EBU R128 loudness normalization. We do this BEFORE the gate
        # because loudnorm's dynamic mode applies up to +30 dB of makeup
        # gain to quiet sections - if it runs after the gate, it amplifies
        # any tiny residual and the silence isn't silent any more. Putting
        # it before means we calibrate to a known signal level, then the
        # gate kills everything below the speech threshold.
        "loudnorm=I=-16:TP=-1.5:LRA=11",
        # Hard noise gate to TRUE SILENCE between phrases.
        #   threshold = 0.1 (-20 dBFS peak): cantor's voice peaks above
        #               -15 dBFS after loudnorm, while "silent" gaps
        #               peak around -21 dBFS (mic handling, breathing,
        #               room thumps). Threshold sits between the two so
        #               only voice opens the gate.
        #   range     = 0    : full gate (drop to true zero, no leakage)
        #   ratio     = 9000 : hard gate floor below threshold
        #   attack    = 20ms : SOFT attack. A faster (~2ms) attack snaps
        #               the gain from 0 -> 1 in 88 samples, which is
        #               audible as a click at every gate-open moment.
        #               20 ms ramps the gain in smoothly without losing
        #               consonant attacks.
        #   release   = 500ms: long release fades quietly back to silence
        #               so phrase endings tail off instead of clipping
        #               off, and bridges word-internal silences.
        #   knee      = 4    : 4 dB-wide soft knee around the threshold
        #               so the gain transition is gradual instead of a
        #               step at exactly -20 dBFS.
        #   detection = peak : peak-based detection - gap noise has high
        #               peaks (handling thumps) but low rms, so peak is
        #               what discriminates voice from gaps here.
        (
            "agate="
            "threshold=0.1:range=0:ratio=9000:"
            "attack=20:release=500:knee=4:detection=peak"
        ),
    ]
)


def run_ffmpeg(src: Path, dst: Path) -> None:
    """Run the cleaning pipeline. Raises on non-zero exit."""
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        str(src),
        "-af",
        FILTER_CHAIN,
        "-c:a",
        "libmp3lame",
        "-b:a",
        "128k",
        "-ar",
        "44100",
        "-ac",
        "1",
        str(dst),
    ]
    subprocess.run(cmd, check=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("input", type=Path, help="Input audio file (mp3/wav/...)")
    parser.add_argument(
        "output",
        nargs="?",
        type=Path,
        default=None,
        help="Output path. Defaults to <input>.cleaned.mp3.",
    )
    parser.add_argument(
        "--in-place",
        action="store_true",
        help="Overwrite the input. A backup is saved to <dir>/.originals/<name>.",
    )
    args = parser.parse_args()

    src: Path = args.input.resolve()
    if not src.exists():
        print(f"error: {src} does not exist", file=sys.stderr)
        return 1

    if args.in_place:
        backup_dir = src.parent / ".originals"
        backup_dir.mkdir(exist_ok=True)
        backup = backup_dir / src.name
        if not backup.exists():
            shutil.copy2(src, backup)
            print(f"backup -> {backup}")
        # Write to a temp sibling, then move into place. Keep the original
        # extension (e.g. .mp3) at the end so ffmpeg can infer the muxer
        # from the filename.
        tmp = src.with_name(f".{src.stem}.cleaning{src.suffix}")
        run_ffmpeg(src=backup, dst=tmp)
        tmp.replace(src)
        print(f"cleaned -> {src}")
    else:
        dst = args.output if args.output else src.with_suffix(".cleaned.mp3")
        dst.parent.mkdir(parents=True, exist_ok=True)
        run_ffmpeg(src=src, dst=dst)
        print(f"cleaned -> {dst}")

    return 0


if __name__ == "__main__":
    sys.exit(main())

"use client";

import { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { Play, Pause } from "lucide-react";

/**
 * SVG overlay of two pitch contours — typically the cantor reference and the
 * student attempt — on a shared y-axis (semitones from each speaker's own
 * tonic). Used by both the word-drill modal (short, one word) and the
 * full-aliya results card (wide, the whole practice). The two callers pass
 * different dimensions; everything else is identical.
 *
 * Both contour arrays must be the same length and contain semitone values
 * (or null for unvoiced gaps — these break the SVG line cleanly instead of
 * collapsing to zero).
 *
 * If audio refs + duration props are provided, hovering over the chart shows
 * a cursor line and a small tooltip with ▶ Cantor / ▶ You buttons so the
 * student can audition either track starting from any point in the contour.
 */
export interface PitchContourOverlayProps {
  reference: Array<number | null>;
  student: Array<number | null>;
  /** SVG viewBox width — pick larger for aliya-level charts so a 300-point
   *  contour doesn't look pixelated on a wide screen. Defaults to 320. */
  width?: number;
  /** SVG viewBox height. Defaults to 80. */
  height?: number;
  /** Tailwind class for the SVG element's height. Defaults to "h-20". */
  heightClass?: string;
  /** Optional aria-label override, useful when the same component renders
   *  twice on the same page (word drill + aliya overview). */
  ariaLabel?: string;

  // ── Optional hover-to-play audio props ───────────────────────────────────
  /** Ref to the cantor <audio> element already mounted in the parent. */
  cantorAudioRef?: React.RefObject<HTMLAudioElement | null>;
  /** Ref to the student <audio> element already mounted in the parent. */
  studentAudioRef?: React.RefObject<HTMLAudioElement | null>;
  /** Start time (seconds) of the cantor segment within the full audio file.
   *  Used to map hover fraction → absolute cantor seek time. Defaults to 0. */
  cantorSegmentStart?: number;
  /** Duration (seconds) of the cantor segment. */
  cantorDuration?: number;
  /** Duration (seconds) of the student practice take. */
  studentDuration?: number;
}

export function PitchContourOverlay({
  reference,
  student,
  width = 320,
  height = 80,
  heightClass = "h-20",
  ariaLabel = "Pitch contour: cantor vs you",
  cantorAudioRef,
  studentAudioRef,
  cantorSegmentStart = 0,
  cantorDuration,
  studentDuration,
}: PitchContourOverlayProps) {
  const PAD_X = 4;
  const PAD_Y = 6;

  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverFraction, setHoverFraction] = useState<number | null>(null);
  const [playingCantor, setPlayingCantor] = useState(false);
  const [playingStudent, setPlayingStudent] = useState(false);
  // Timer that hides the tooltip after the mouse leaves the chart. The tooltip
  // cancels it on mouseEnter so the user can move from the chart to the
  // buttons without the tooltip vanishing mid-travel.
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasAudio =
    (cantorAudioRef != null && cantorDuration != null) ||
    studentAudioRef != null;

  // ── Track playback state on the shared audio elements ──────────────────
  useEffect(() => {
    const a = cantorAudioRef?.current;
    if (!a) return;
    const onPlay = () => setPlayingCantor(true);
    const onStop = () => setPlayingCantor(false);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onStop);
    a.addEventListener("ended", onStop);
    return () => {
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onStop);
      a.removeEventListener("ended", onStop);
    };
  }, [cantorAudioRef]);

  useEffect(() => {
    const a = studentAudioRef?.current;
    if (!a) return;
    const onPlay = () => setPlayingStudent(true);
    const onStop = () => setPlayingStudent(false);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onStop);
    a.addEventListener("ended", onStop);
    return () => {
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onStop);
      a.removeEventListener("ended", onStop);
    };
  }, [studentAudioRef]);

  // ── Mouse tracking ──────────────────────────────────────────────────────
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!hasAudio) return;
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      setHoverFraction(fraction);
    },
    [hasAudio]
  );

  const scheduleHide = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setHoverFraction(null), 160);
  }, []);

  const cancelHide = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  // Clean up the timer on unmount
  useEffect(() => () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  }, []);

  // ── Audio playback ──────────────────────────────────────────────────────
  // Always seek to the hovered position and play — never toggle. Each click
  // means "play from here", not "pause if already playing". The playing-state
  // indicators in the tooltip are informational only.
  const playFromFraction = useCallback(
    (which: "cantor" | "student", fraction: number) => {
      if (which === "cantor") {
        const a = cantorAudioRef?.current;
        if (!a || cantorDuration == null) return;
        studentAudioRef?.current?.pause();
        a.currentTime = cantorSegmentStart + fraction * cantorDuration;
        void a.play();
      } else {
        const a = studentAudioRef?.current;
        if (!a) return;
        cantorAudioRef?.current?.pause();
        const dur = studentDuration ?? (Number.isFinite(a.duration) ? a.duration : 0);
        a.currentTime = fraction * dur;
        void a.play();
      }
    },
    [cantorAudioRef, studentAudioRef, cantorSegmentStart, cantorDuration, studentDuration]
  );

  // ── Contour geometry ────────────────────────────────────────────────────
  const points = useMemo(() => {
    const all: number[] = [];
    for (const v of reference) if (v != null && Number.isFinite(v)) all.push(v);
    for (const v of student) if (v != null && Number.isFinite(v)) all.push(v);
    if (all.length === 0) return null;
    let min = Math.min(...all);
    let max = Math.max(...all);
    if (max - min < 4) {
      const mid = (min + max) / 2;
      min = mid - 2;
      max = mid + 2;
    }
    const xFor = (i: number, len: number) =>
      PAD_X + (i / Math.max(1, len - 1)) * (width - 2 * PAD_X);
    const yFor = (v: number) =>
      height - PAD_Y - ((v - min) / (max - min)) * (height - 2 * PAD_Y);
    const pathFor = (arr: Array<number | null>) => {
      let d = "";
      let pen = false;
      for (let i = 0; i < arr.length; i++) {
        const v = arr[i];
        if (v == null || !Number.isFinite(v)) {
          pen = false;
          continue;
        }
        const x = xFor(i, arr.length);
        const y = yFor(v);
        d += pen
          ? ` L${x.toFixed(1)} ${y.toFixed(1)}`
          : `M${x.toFixed(1)} ${y.toFixed(1)}`;
        pen = true;
      }
      return d;
    };
    return {
      ref: pathFor(reference),
      stu: pathFor(student),
      yZero: yFor(0),
    };
  }, [reference, student, width, height]);

  if (!points) {
    return (
      <div className="text-muted-foreground rounded border bg-white/50 p-3 text-center text-xs dark:bg-white/5">
        No pitch data to plot.
      </div>
    );
  }

  // Cursor X in SVG-coordinate space
  const cursorSvgX =
    hoverFraction != null
      ? PAD_X + hoverFraction * (width - 2 * PAD_X)
      : null;

  // Time labels shown in the hover tooltip
  const cantorTimeLabel =
    hoverFraction != null && cantorDuration != null
      ? formatTime(cantorSegmentStart + hoverFraction * cantorDuration)
      : null;
  const studentTimeLabel =
    hoverFraction != null && studentDuration != null
      ? formatTime(hoverFraction * studentDuration)
      : null;

  // Tooltip alignment: keep it on-screen at left/right edges
  const tooltipTransform =
    hoverFraction != null
      ? hoverFraction > 0.75
        ? "translateX(-100%)"
        : hoverFraction < 0.15
          ? "translateX(0%)"
          : "translateX(-50%)"
      : "translateX(-50%)";

  return (
    <div className="rounded border bg-white/60 p-2 dark:bg-white/5">
      {/* Chart area — mouse tracking lives on this wrapper */}
      <div
        ref={containerRef}
        className={`relative w-full select-none ${hasAudio ? "cursor-crosshair" : ""}`}
        onMouseMove={handleMouseMove}
        onMouseLeave={scheduleHide}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className={`${heightClass} w-full`}
          preserveAspectRatio="none"
          role="img"
          aria-label={ariaLabel}
        >
          {/* Tonic baseline (semitone 0) */}
          <line
            x1={PAD_X}
            y1={points.yZero}
            x2={width - PAD_X}
            y2={points.yZero}
            stroke="currentColor"
            strokeOpacity={0.15}
            strokeDasharray="2 3"
          />
          {/* Cantor contour */}
          <path
            d={points.ref}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.55}
            strokeWidth={2}
          />
          {/* Student contour */}
          <path
            d={points.stu}
            fill="none"
            stroke="rgb(16 185 129)"
            strokeWidth={2}
            strokeDasharray="4 3"
          />
          {/* Hover cursor */}
          {cursorSvgX != null && (
            <line
              x1={cursorSvgX}
              y1={PAD_Y}
              x2={cursorSvgX}
              y2={height - PAD_Y}
              stroke="currentColor"
              strokeOpacity={0.35}
              strokeWidth={1}
              strokeDasharray="2 2"
            />
          )}
        </svg>

        {/* Hover tooltip — floats just above the cursor line */}
        {hoverFraction != null && hasAudio && (
          <div
            className="absolute bottom-full mb-1 z-10"
            style={{
              left: `${hoverFraction * 100}%`,
              transform: tooltipTransform,
            }}
            onMouseEnter={cancelHide}
            onMouseLeave={scheduleHide}
          >
            <div className="flex items-center gap-0.5 rounded border border-border/60 bg-background/95 px-1 py-0.5 shadow-md backdrop-blur-sm">
              {/* ▶ Cantor */}
              {cantorAudioRef != null && cantorDuration != null && (
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    playFromFraction("cantor", hoverFraction);
                  }}
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  title={
                    cantorTimeLabel
                      ? `Play cantor from ${cantorTimeLabel}`
                      : "Play cantor"
                  }
                >
                  {playingCantor ? (
                    <Pause className="size-2.5 shrink-0" />
                  ) : (
                    <Play className="size-2.5 shrink-0" />
                  )}
                  <span className="font-mono whitespace-nowrap">
                    Cantor{cantorTimeLabel ? ` ${cantorTimeLabel}` : ""}
                  </span>
                </button>
              )}

              {/* Divider */}
              {cantorAudioRef != null &&
                cantorDuration != null &&
                studentAudioRef != null && (
                  <span className="text-[10px] text-border select-none">·</span>
                )}

              {/* ▶ You */}
              {studentAudioRef != null && (
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    playFromFraction("student", hoverFraction);
                  }}
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-emerald-600 transition-colors hover:bg-emerald-500/10 dark:text-emerald-400"
                  title={
                    studentTimeLabel
                      ? `Play your practice from ${studentTimeLabel}`
                      : "Play your practice"
                  }
                >
                  {playingStudent ? (
                    <Pause className="size-2.5 shrink-0" />
                  ) : (
                    <Play className="size-2.5 shrink-0" />
                  )}
                  <span className="font-mono whitespace-nowrap">
                    You{studentTimeLabel ? ` ${studentTimeLabel}` : ""}
                  </span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="text-muted-foreground mt-1 flex items-center justify-center gap-3 text-[10px]">
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 bg-current opacity-55" />
          Cantor
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 border-t-2 border-dashed border-emerald-500" />
          You
        </span>
        {hasAudio && (
          <span className="text-muted-foreground/50 italic">
            hover to play from any point
          </span>
        )}
      </div>
    </div>
  );
}

// ── Utility ────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0.0s";
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(1);
  return m > 0 ? `${m}:${s.padStart(4, "0")}` : `${s}s`;
}

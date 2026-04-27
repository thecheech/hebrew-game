"use client";

import { Pause, Play } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { AnalysisResult, AliyaData } from "@/lib/parasha-types";
import { flattenWords } from "@/lib/parasha-types";
import { cn } from "@/lib/utils";
import { PitchContourOverlay } from "@/components/pitch-contour-overlay";
import { WordDrillModal } from "@/components/word-drill-modal";

interface AnalysisResultsCardProps {
  results: AnalysisResult;
  aliya: AliyaData;
  scrollStyle: boolean;
  onReset: () => void;
  /** When the practice was scoped to a single phrase, restrict the
   *  word-by-word grid to those words and label the card accordingly.
   *  Word indices are inclusive into the flat-words array. */
  segmentInfo?: {
    startWord: number;
    endWord: number;
    label: string;
  } | null;
  /** Object URL for the student's practice take. When provided alongside a
   *  phrase segment, the card renders Play cantor / Play student buttons
   *  so the student can A/B their take against the cantor's reading of
   *  the same words. */
  studentAudioUrl?: string | null;
}

export function AnalysisResultsCard({
  results,
  aliya,
  scrollStyle,
  onReset,
  segmentInfo,
  studentAudioUrl,
}: AnalysisResultsCardProps) {
  // All hooks must run unconditionally — the success / error split happens
  // below after the hooks have been registered.
  const flatWords = useMemo(() => flattenWords(aliya), [aliya]);

  // Word drill modal state — clicking a scored word opens it for practice.
  const [drillOpen, setDrillOpen] = useState(false);
  const [drillWordIdx, setDrillWordIdx] = useState(0);

  // Word-grid coloring mode. Pitch is the historical default; pronunciation
  // is a separate metric scored from MFCCs. Toggle between them so the user
  // can see which words drove each rollup score.
  const [colorMode, setColorMode] = useState<"pitch" | "pronunciation">(
    "pitch"
  );

  // ── A/B playback for phrase analysis ────────────────────────────────────
  // Two parallel audio elements — one for the cantor (clipped to the
  // practice phrase) and one for the student's take. Only one plays at a
  // time so the user can flip between them and hear the difference.
  const cantorAudioRef = useRef<HTMLAudioElement | null>(null);
  const studentAudioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<"cantor" | "student" | null>(null);

  // Cantor segment bounds, in cantor-time. Prefer the analyzer's reported
  // window (segment_start/end) — those are the exact seconds the analyzer
  // scored. Fall back to the words' own timings when the result didn't
  // round-trip them (older cached results).
  const cantorSegmentStart = useMemo(() => {
    if (typeof results.segment_start === "number") return results.segment_start;
    if (segmentInfo) {
      const w = flatWords[segmentInfo.startWord];
      if (w) return w.start;
    }
    return null;
  }, [results.segment_start, segmentInfo, flatWords]);

  const cantorSegmentEnd = useMemo(() => {
    if (typeof results.segment_end === "number") return results.segment_end;
    if (segmentInfo) {
      const w = flatWords[segmentInfo.endWord];
      if (w) return w.end;
    }
    return null;
  }, [results.segment_end, segmentInfo, flatWords]);

  // Stop the cantor at the phrase boundary — the <audio> element itself
  // doesn't know about the segment; we have to police it via timeupdate.
  useEffect(() => {
    const a = cantorAudioRef.current;
    if (!a || cantorSegmentEnd == null) return;
    const onTime = () => {
      if (a.currentTime >= cantorSegmentEnd) {
        a.pause();
        // Snap back to the segment start so a second click replays the
        // phrase from the top instead of the (now post-segment) playhead.
        if (cantorSegmentStart != null) a.currentTime = cantorSegmentStart;
      }
    };
    a.addEventListener("timeupdate", onTime);
    return () => a.removeEventListener("timeupdate", onTime);
  }, [cantorSegmentStart, cantorSegmentEnd]);

  const handlePlayCantor = useCallback(() => {
    const a = cantorAudioRef.current;
    if (!a) return;
    // Pause the student in case it was running — only one voice at a time.
    studentAudioRef.current?.pause();
    if (playing === "cantor") {
      a.pause();
      return;
    }
    if (cantorSegmentStart != null) {
      // Seek to the phrase start every time so the user always hears the
      // full phrase, not whatever fragment is left from a prior partial
      // playback.
      a.currentTime = cantorSegmentStart;
    }
    void a.play();
  }, [playing, cantorSegmentStart]);

  const handlePlayStudent = useCallback(() => {
    const a = studentAudioRef.current;
    if (!a) return;
    cantorAudioRef.current?.pause();
    if (playing === "student") {
      a.pause();
      return;
    }
    a.currentTime = 0;
    void a.play();
  }, [playing]);

  if (results.status !== "success" || !results.word_scores) {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-destructive">Analysis Error</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">{results.error || "Unknown error"}</p>
          <Button onClick={onReset} variant="outline" size="sm">
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const wordScores = results.word_scores;

  // Older results may not have `attempted`; treat missing as true so we
  // don't break on cached data from before this field existed.
  const attemptedScores = wordScores.filter((s) => s.attempted !== false);
  const greenCount = attemptedScores.filter((s) => s.verdict === "green").length;
  const yellowCount = attemptedScores.filter((s) => s.verdict === "yellow").length;
  const redCount = attemptedScores.filter((s) => s.verdict === "red").length;
  const notAttemptedCount = wordScores.length - attemptedScores.length;

  // Accuracy is a fraction of words actually attempted, not the whole aliya.
  // Otherwise stopping early always tanks the percentage.
  const accuracyPercent =
    attemptedScores.length > 0
      ? Math.round((greenCount / attemptedScores.length) * 100)
      : 0;

  return (
    <Card className="border-emerald-500/30 bg-emerald-50/50 shadow-md dark:bg-emerald-950/20">
      <CardHeader>
        <div className="space-y-2">
          <CardTitle className="text-emerald-700 dark:text-emerald-300">
            {segmentInfo ? "Phrase analysis" : "Analysis Complete"}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {segmentInfo
              ? `Performance breakdown for ${segmentInfo.label}`
              : "Performance breakdown for this practice"}
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Audio elements — always mounted so the pitch-contour hover-to-play
            works in both phrase and full-aliya views. The timeupdate handler
            bounds cantor playback to the phrase when segmentInfo is set. */}
        <audio
          ref={cantorAudioRef}
          src={aliya.audio}
          preload="auto"
          onPlay={() => setPlaying("cantor")}
          onPause={() => setPlaying((p) => (p === "cantor" ? null : p))}
          onEnded={() => setPlaying((p) => (p === "cantor" ? null : p))}
        />
        {studentAudioUrl && (
          <audio
            ref={studentAudioRef}
            src={studentAudioUrl}
            preload="auto"
            onPlay={() => setPlaying("student")}
            onPause={() => setPlaying((p) => (p === "student" ? null : p))}
            onEnded={() => setPlaying((p) => (p === "student" ? null : p))}
          />
        )}

        {/* Phrase A/B playback buttons — only shown when practice was
            scoped to a single phrase, since the buttons compare the
            student's take to the cantor's reading of those words. Hidden
            in full-aliya mode to avoid duplicating the listen-mode
            transport. */}
        {segmentInfo && (
          <>
            <div className="rounded-lg border border-emerald-200/50 bg-emerald-50/40 p-3 dark:border-emerald-800/50 dark:bg-emerald-900/20">
              <p className="mb-2 text-xs font-semibold text-muted-foreground">
                Compare playback
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={playing === "cantor" ? "default" : "outline"}
                  onClick={handlePlayCantor}
                  disabled={cantorSegmentStart == null}
                  aria-label={
                    playing === "cantor" ? "Pause cantor" : "Play cantor audio"
                  }
                >
                  {playing === "cantor" ? (
                    <Pause className="size-4" />
                  ) : (
                    <Play className="size-4" />
                  )}
                  <span className="ml-1.5">
                    {playing === "cantor" ? "Pause cantor" : "Play cantor audio"}
                  </span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={playing === "student" ? "default" : "outline"}
                  onClick={handlePlayStudent}
                  disabled={!studentAudioUrl}
                  aria-label={
                    playing === "student"
                      ? "Pause your practice"
                      : "Play your practice"
                  }
                  title={
                    studentAudioUrl
                      ? undefined
                      : "Your practice audio isn't available for this take"
                  }
                >
                  {playing === "student" ? (
                    <Pause className="size-4" />
                  ) : (
                    <Play className="size-4" />
                  )}
                  <span className="ml-1.5">
                    {playing === "student"
                      ? "Pause student"
                      : "Play student audio"}
                  </span>
                </Button>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Flip between the cantor&apos;s phrase and your take to hear
                where they differ.
              </p>
            </div>
          </>
        )}

        {/* Two session-level hero scores: pitch (left) and pronunciation
            (right). They're scored from different signals (F0 vs MFCC) so
            they can disagree — e.g. right notes wrong words, or vice versa. */}
        {(typeof results.overall_score === "number" ||
          typeof results.overall_pronunciation_score === "number") && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {typeof results.overall_score === "number" && (
              <div
                className={cn(
                  "rounded-lg border p-4",
                  results.overall_verdict === "green" &&
                    "border-emerald-300/60 bg-emerald-100/40 dark:border-emerald-700/60 dark:bg-emerald-900/20",
                  results.overall_verdict === "yellow" &&
                    "border-amber-300/60 bg-amber-100/40 dark:border-amber-700/60 dark:bg-amber-900/20",
                  (results.overall_verdict === "red" ||
                    !results.overall_verdict) &&
                    "border-rose-300/60 bg-rose-100/40 dark:border-rose-700/60 dark:bg-rose-900/20"
                )}
              >
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Pitch score
                </p>
                <div className="flex items-baseline gap-2">
                  <span
                    className={cn(
                      "text-4xl font-bold tabular-nums",
                      results.overall_verdict === "green" &&
                        "text-emerald-700 dark:text-emerald-300",
                      results.overall_verdict === "yellow" &&
                        "text-amber-700 dark:text-amber-300",
                      (results.overall_verdict === "red" ||
                        !results.overall_verdict) &&
                        "text-rose-700 dark:text-rose-300"
                    )}
                  >
                    {Math.round(results.overall_score)}
                  </span>
                  <span className="text-sm text-muted-foreground">/ 100</span>
                </div>
                {results.overall_mae != null && (
                  <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                    Avg error:{" "}
                    <span className="font-mono">
                      {results.overall_mae.toFixed(2)} semitones
                    </span>
                  </p>
                )}
                {typeof results.coverage_pct === "number" && (
                  <p className="text-xs text-muted-foreground tabular-nums">
                    Coverage:{" "}
                    <span className="font-mono">
                      {results.attempted_words ?? 0} /{" "}
                      {results.total_words ?? 0} ({results.coverage_pct}%)
                    </span>
                  </p>
                )}
              </div>
            )}

            {typeof results.overall_pronunciation_score === "number" && (
              <div
                className={cn(
                  "rounded-lg border p-4",
                  results.overall_pronunciation_verdict === "green" &&
                    "border-emerald-300/60 bg-emerald-100/40 dark:border-emerald-700/60 dark:bg-emerald-900/20",
                  results.overall_pronunciation_verdict === "yellow" &&
                    "border-amber-300/60 bg-amber-100/40 dark:border-amber-700/60 dark:bg-amber-900/20",
                  (results.overall_pronunciation_verdict === "red" ||
                    !results.overall_pronunciation_verdict) &&
                    "border-rose-300/60 bg-rose-100/40 dark:border-rose-700/60 dark:bg-rose-900/20"
                )}
              >
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Pronunciation score
                </p>
                <div className="flex items-baseline gap-2">
                  <span
                    className={cn(
                      "text-4xl font-bold tabular-nums",
                      results.overall_pronunciation_verdict === "green" &&
                        "text-emerald-700 dark:text-emerald-300",
                      results.overall_pronunciation_verdict === "yellow" &&
                        "text-amber-700 dark:text-amber-300",
                      (results.overall_pronunciation_verdict === "red" ||
                        !results.overall_pronunciation_verdict) &&
                        "text-rose-700 dark:text-rose-300"
                    )}
                  >
                    {Math.round(results.overall_pronunciation_score)}
                  </span>
                  <span className="text-sm text-muted-foreground">/ 100</span>
                </div>
                {results.overall_pronunciation_distance != null && (
                  <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                    Avg distance:{" "}
                    <span className="font-mono">
                      {results.overall_pronunciation_distance.toFixed(2)}
                    </span>
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Cepstral similarity to cantor
                </p>
              </div>
            )}
          </div>
        )}

        {/* Summary stats */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-lg bg-white/50 p-3 text-center dark:bg-white/5">
            <p className="text-xs text-muted-foreground">On Key</p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {greenCount}
            </p>
            <p className="text-xs text-muted-foreground">
              {accuracyPercent}%
              {notAttemptedCount > 0 ? " of attempted" : ""}
            </p>
          </div>
          <div className="rounded-lg bg-white/50 p-3 text-center dark:bg-white/5">
            <p className="text-xs text-muted-foreground">Close</p>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {yellowCount}
            </p>
          </div>
          <div className="rounded-lg bg-white/50 p-3 text-center dark:bg-white/5">
            <p className="text-xs text-muted-foreground">Off Pitch</p>
            <p className="text-2xl font-bold text-rose-600 dark:text-rose-400">
              {redCount}
            </p>
          </div>
          <div className="rounded-lg bg-white/50 p-3 text-center dark:bg-white/5">
            <p className="text-xs text-muted-foreground">Tonic (you / cantor)</p>
            <p className="text-sm font-mono leading-tight">
              {results.student_tonic_hz?.toFixed(0) ?? "—"} /{" "}
              {results.reference_tonic_hz?.toFixed(0) ??
                results.tonic_hz?.toFixed(0) ??
                "—"}{" "}
              Hz
            </p>
          </div>
        </div>

        {/* Aliya-level pitch contour overlay (cantor solid, student dashed).
            Both arrays are pre-resampled to the same length on the server so
            we just render index → x. Wider viewBox than the word-drill modal
            since this contour can be hundreds of points across a multi-minute
            take. */}
        {results.reference_contour && results.student_contour && (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground">
              Pitch contour — you vs cantor
            </p>
            <PitchContourOverlay
              reference={results.reference_contour}
              student={results.student_contour}
              width={800}
              height={140}
              heightClass="h-32"
              ariaLabel="Aliya pitch contour: cantor vs you"
              cantorAudioRef={cantorAudioRef}
              studentAudioRef={studentAudioRef}
              cantorSegmentStart={cantorSegmentStart ?? undefined}
              cantorDuration={
                cantorSegmentStart != null && cantorSegmentEnd != null
                  ? cantorSegmentEnd - cantorSegmentStart
                  : results.reference_duration ?? undefined
              }
              studentDuration={results.student_duration ?? undefined}
            />
            <p className="text-[10px] text-muted-foreground">
              Each line is a speaker&apos;s pitch in semitones from their own tonic
              — flat means at-tonic, peaks/dips show the trope shape. The
              student curve ends where you stopped singing.
            </p>
          </div>
        )}

        {/* Duration comparison */}
        <div className="rounded-lg border border-emerald-200/50 bg-emerald-50/30 p-3 dark:border-emerald-800/50 dark:bg-emerald-900/20">
          <p className="text-xs font-semibold text-muted-foreground mb-2">
            Duration
          </p>
          <div className="flex items-center justify-between text-sm">
            <span>Your practice</span>
            <span className="font-mono">
              {results.student_duration?.toFixed(1)}s
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Reference</span>
            <span className="font-mono">
              {results.reference_duration?.toFixed(1)}s
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>Speed ratio</span>
            <span className="font-mono">
              {(
                ((results.student_duration || 0) /
                  (results.reference_duration || 1)) *
                100
              ).toFixed(0)}%
            </span>
          </div>
          {notAttemptedCount > 0 && (
            <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>Words attempted</span>
              <span className="font-mono">
                {attemptedScores.length} / {wordScores.length}
              </span>
            </div>
          )}
        </div>

        {/* Word-by-word breakdown */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Word-by-Word Breakdown</h3>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs">Color by:</span>
              <div className="inline-flex rounded-md border border-emerald-200/60 dark:border-emerald-800/60 overflow-hidden text-xs">
                <button
                  type="button"
                  onClick={() => setColorMode("pitch")}
                  className={cn(
                    "px-2 py-1 transition-colors",
                    colorMode === "pitch"
                      ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                      : "text-muted-foreground hover:bg-emerald-500/10"
                  )}
                  aria-pressed={colorMode === "pitch"}
                >
                  Pitch
                </button>
                <button
                  type="button"
                  onClick={() => setColorMode("pronunciation")}
                  className={cn(
                    "px-2 py-1 transition-colors border-l border-emerald-200/60 dark:border-emerald-800/60",
                    colorMode === "pronunciation"
                      ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                      : "text-muted-foreground hover:bg-emerald-500/10"
                  )}
                  aria-pressed={colorMode === "pronunciation"}
                >
                  Pronunciation
                </button>
              </div>
              <p className="text-muted-foreground text-xs hidden sm:block">
                Tap to drill
              </p>
            </div>
          </div>
          <div className="space-y-3 rounded-lg border border-emerald-200/30 bg-white/30 p-3 dark:border-emerald-800/30 dark:bg-white/5">
            {aliya.verses.map((verse) => {
              const verseScores = verse.words.map((word) => {
                // Find the score for this word by matching its timing
                return wordScores.find(
                  (s) =>
                    Math.abs(s.startTime - word.start) < 0.1 &&
                    Math.abs(s.endTime - word.end) < 0.1
                );
              });

              // When practice was scoped to a single phrase, hide
              // verses that don't intersect the segment so the breakdown
              // only shows what was actually scored.
              if (segmentInfo) {
                const verseStart = flatWords.indexOf(verse.words[0]);
                const verseEnd =
                  verseStart + verse.words.length - 1;
                if (
                  verseEnd < segmentInfo.startWord ||
                  verseStart > segmentInfo.endWord
                ) {
                  return null;
                }
              }

              return (
                <div key={verse.ref} className="space-y-1">
                  <p className="text-xs font-mono text-muted-foreground">
                    Genesis {verse.ref}
                  </p>
                  <div
                    className="font-hebrew flex flex-wrap gap-1 text-lg leading-relaxed"
                    dir="rtl"
                    lang="he"
                  >
                    {verse.words.map((word, wi) => {
                      const score = verseScores[wi];
                      // Hide words outside the practice segment. We render
                      // partial verses so the user sees exactly the slice
                      // that was scored, not the surrounding context greyed
                      // out (which we'd otherwise have to colour as "not
                      // attempted" — visually noisy for short phrases).
                      if (segmentInfo) {
                        const flatIdx = flatWords.indexOf(word);
                        if (
                          flatIdx < segmentInfo.startWord ||
                          flatIdx > segmentInfo.endWord
                        ) {
                          return null;
                        }
                      }
                      const notAttempted = score?.attempted === false;
                      const activeVerdict =
                        colorMode === "pronunciation"
                          ? score?.pronunciation?.verdict ?? null
                          : score?.verdict ?? null;

                      const verdictClass = notAttempted
                        ? "text-muted-foreground/50"
                        : activeVerdict === "green"
                          ? "bg-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                          : activeVerdict === "yellow"
                            ? "bg-amber-500/30 text-amber-700 dark:text-amber-300"
                            : activeVerdict === "red"
                              ? "bg-rose-500/30 text-rose-700 dark:text-rose-300"
                              : "text-muted-foreground";

                      const display = scrollStyle ? word.plain : word.text;

                      const pitchPart =
                        score?.mae == null
                          ? "pitch: —"
                          : `pitch: ${score.mae.toFixed(2)} st`;
                      const pronDist = score?.pronunciation?.distance;
                      const pronPart =
                        pronDist == null
                          ? "pronunciation: —"
                          : `pronunciation: ${pronDist.toFixed(2)}`;
                      const tooltip = notAttempted
                        ? "Not attempted — tap to practice"
                        : score
                          ? `${pitchPart} · ${pronPart} — tap to practice`
                          : "Tap to practice";

                      // Resolve the word's index in the flat-words array so
                      // the drill modal knows which word to load.
                      const flatIdx = flatWords.indexOf(word);

                      return (
                        <button
                          key={`${verse.ref}-${wi}`}
                          type="button"
                          onClick={() => {
                            if (flatIdx < 0) return;
                            setDrillWordIdx(flatIdx);
                            setDrillOpen(true);
                          }}
                          className={cn(
                            "cursor-pointer rounded px-1.5 py-0.5 transition-colors hover:ring-2 hover:ring-primary/40 focus:outline-none focus:ring-2 focus:ring-primary",
                            verdictClass
                          )}
                          title={tooltip}
                        >
                          {display}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend — adapts to whichever metric is currently coloring the
              grid. Thresholds are just labels here; the source of truth is
              scripts/analyze_audio.py. */}
          <div className="flex flex-wrap gap-3 text-xs">
            {colorMode === "pitch" ? (
              <>
                <div className="flex items-center gap-1.5">
                  <div className="h-3 w-3 rounded bg-emerald-500/30" />
                  <span>On key (≤2 semitones)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-3 w-3 rounded bg-amber-500/30" />
                  <span>Close (≤4 semitones)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-3 w-3 rounded bg-rose-500/30" />
                  <span>Off pitch (&gt;4 semitones)</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1.5">
                  <div className="h-3 w-3 rounded bg-emerald-500/30" />
                  <span>Clear pronunciation</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-3 w-3 rounded bg-amber-500/30" />
                  <span>Close</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-3 w-3 rounded bg-rose-500/30" />
                  <span>Unclear / off</span>
                </div>
              </>
            )}
            {notAttemptedCount > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded border border-muted-foreground/30" />
                <span>Not attempted</span>
              </div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button onClick={onReset} variant="default" size="sm">
            Practice again
          </Button>
          <Button variant="outline" size="sm" disabled>
            Download Report (coming soon)
          </Button>
        </div>
      </CardContent>

      <WordDrillModal
        open={drillOpen}
        onOpenChange={setDrillOpen}
        parasha={aliya.parasha}
        aliyaNum={aliya.aliyaNum}
        audioSrc={aliya.audio}
        words={flatWords}
        initialWordIdx={drillWordIdx}
        scrollStyle={scrollStyle}
      />
    </Card>
  );
}

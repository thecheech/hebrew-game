"use client";

import {
  Loader2,
  Mic,
  MicOff,
  Pause,
  Play,
  Repeat,
  RotateCcw,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AnalysisResultsCard } from "@/components/analysis-results-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  type AliyaData,
  type AnalysisResult,
  buildPhrases,
  flattenWords,
} from "@/lib/parasha-types";
import { WordDrillModal } from "@/components/word-drill-modal";
import { MicPitchEngine } from "@/lib/pitch";
import { cn } from "@/lib/utils";
/** Identifies the cantor being scored against. When omitted (or matching
 *  the default cantor), the API falls back to the default reference. */
export type CantorScoringRef = {
  /** Stable id, used as a cache-key suffix on the python side. */
  id: string;
  /** Public URL of the cantor's reference MP3. */
  audio: string;
  /** Public URL of the cantor's per-aliya words JSON, or null if the
   *  caller hasn't run the alignment script yet (the API tolerates
   *  this — it falls back to the default cantor's word boundaries). */
  wordsJson: string | null;
};

interface ParashaLeadModeProps {
  aliya: AliyaData;
  scrollStyle: boolean;
  showTranslit: boolean;
  /** Cantor scoring reference. Optional: when null the analyze API uses
   *  its default-cantor reference paths. */
  cantor?: CantorScoringRef | null;
}

type PracticeState = "idle" | "practicing" | "analyzing" | "done" | "error";

const SPEED_OPTIONS = [
  { value: 0.5, label: "0.5×" },
  { value: 0.75, label: "0.75×" },
  { value: 1, label: "1×" },
];

/** Treat very short clips (< 0.05s) as "instantaneous markers" so we don't strobe. */
const MIN_HIGHLIGHT_DURATION = 0.05;

/**
 * Practice-with-mic mode. Combines Listen-mode controls (play the cantor,
 * scrub to a word, loop a phrase) with the mic. The user can practice
 * the whole aliya, OR pick a phrase (single tap = select; double-tap or
 * loop icon = loop while listening) and practice just that segment — the
 * resulting analysis only covers that phrase.
 */
export function ParashaLeadMode({
  aliya,
  scrollStyle,
  showTranslit,
  cantor = null,
}: ParashaLeadModeProps) {
  // ── Practice session state ───────────────────────────────────────────────
  const [practiceState, setPracticeState] = useState<PracticeState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [analysisResults, setAnalysisResults] =
    useState<AnalysisResult | null>(null);
  const [practiceDuration, setPracticeDuration] = useState(0);
  /** When we practiced a single segment, remember which phrase it was so the
   *  results card can scope its display to those words. */
  const [practicePhraseIdx, setPracticePhraseIdx] = useState<number | null>(
    null,
  );
  /** Object URL for the most recent student practice take, so the
   *  analysis card can replay it back-to-back with the cantor segment.
   *  Created on stop, revoked on reset / unmount so we don't leak blobs. */
  const [studentAudioUrl, setStudentAudioUrl] = useState<string | null>(null);

  // ── Listen-mode (audio playback) state ──────────────────────────────────
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  /** Phrase being looped during cantor playback (Listen-style behaviour). */
  const [loopPhraseIdx, setLoopPhraseIdx] = useState<number | null>(null);
  /** Phrase the user has *selected* to practice. May or may not equal
   *  loopPhraseIdx — selection persists across play/pause and loop toggling
   *  so "Practice" knows which segment to capture. */
  const [selectedPhraseIdx, setSelectedPhraseIdx] = useState<number | null>(
    null,
  );

  const [drillOpen, setDrillOpen] = useState(false);
  const [drillWordIdx, setDrillWordIdx] = useState(0);
  /** Word index of the last tap; second tap on the same word opens the drill. */
  const lastWordTapIdxRef = useRef<number | null>(null);

  const phrases = useMemo(() => buildPhrases(aliya), [aliya]);
  const flatWords = useMemo(() => flattenWords(aliya), [aliya]);

  // Map word index → phrase index (for hover/highlight bookkeeping).
  const wordIdxToPhrase = useMemo(() => {
    const map = new Array<number>(flatWords.length).fill(-1);
    phrases.forEach((p, pi) => {
      for (let i = p.startWord; i <= p.endWord; i++) map[i] = pi;
    });
    return map;
  }, [flatWords.length, phrases]);

  // Mic engine
  const micRef = useRef<MicPitchEngine | null>(null);
  const practiceStartTimeRef = useRef<number>(0);
  /** Where the read-along cursor is (flat-word index). Driven by the
   *  practice timer; stays put when not practicing. State (not
   *  a ref) because it's read during render to highlight the current
   *  word, and React's lint rules (rightly) flag refs read in render. */
  const [cursorWordProgress, setCursorWordProgress] = useState(0);
  /** Pre-computed segment span (cantor reference time, seconds) when the
   *  user starts a segment practice. Saved off so the auto-stop timer and
   *  the API submission both see the same window. */
  const segmentSpanRef = useRef<{
    startTime: number;
    endTime: number;
    startWord: number;
    endWord: number;
    phraseIdx: number;
  } | null>(null);
  const segmentStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Initialise mic on mount
  useEffect(() => {
    const mic = new MicPitchEngine();
    micRef.current = mic;
    return () => {
      mic.stop();
      micRef.current = null;
    };
  }, []);

  // ── Audio: highlight word under playhead ────────────────────────────────
  const currentWordIdx = useMemo(() => {
    if (flatWords.length === 0) return -1;
    let lo = 0;
    let hi = flatWords.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (flatWords[mid].start <= currentTime + 0.001) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (ans < 0) return -1;
    const w = flatWords[ans];
    if (currentTime > w.end + MIN_HIGHLIGHT_DURATION && ans + 1 < flatWords.length) {
      return ans;
    }
    return ans;
  }, [currentTime, flatWords]);

  // Sync `audio.playbackRate` with state.
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed]);

  // RAF loop while playing — gives ~60Hz highlight updates.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (!isPlaying) {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    let stopped = false;
    const tick = () => {
      if (stopped) return;
      setCurrentTime(a.currentTime);
      // Phrase looping: when we cross the end of the looped phrase, jump back
      // to its start.
      if (loopPhraseIdx != null) {
        const p = phrases[loopPhraseIdx];
        if (p && a.currentTime >= p.endTime - 0.01) {
          a.currentTime = p.startTime;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [isPlaying, loopPhraseIdx, phrases]);

  // Note: there's intentionally no "reset state on aliya.audio change"
  // effect here — the parent keys this component on aliya.audio so React
  // remounts it on aliya switch, which resets all of this state by virtue
  // of a fresh component instance. That avoids piling 8+ setState calls
  // into one effect (which trips react-hooks/set-state-in-effect and
  // would cascade renders besides).

  // ── Practicing: cursor progress while the mic is on ───────────────────────
  useEffect(() => {
    if (practiceState !== "practicing") return;

    const interval = setInterval(() => {
      const elapsed = Date.now() / 1000 - practiceStartTimeRef.current;
      setPracticeDuration(elapsed);

      // Map elapsed time to a word cursor inside the relevant span (whole
      // aliya, or just the segment if one is selected).
      const span = segmentSpanRef.current;
      if (span) {
        const segDuration = Math.max(0.1, span.endTime - span.startTime);
        const progress = Math.min(elapsed / segDuration, 1);
        const wordCount = span.endWord - span.startWord + 1;
        setCursorWordProgress(
          span.startWord + Math.floor(progress * wordCount),
        );
      } else {
        const refDuration = aliya.duration;
        const progress = Math.min(elapsed / refDuration, 1);
        setCursorWordProgress(Math.floor(progress * flatWords.length));
      }
    }, 100);

    return () => clearInterval(interval);
  }, [practiceState, aliya.duration, flatWords.length]);

  // ── Audio control handlers (Listen-mode parity) ─────────────────────────
  const handlePlayPause = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      void a.play();
    } else {
      a.pause();
    }
  }, []);

  const handleSeekToWord = useCallback(
    (wordIdx: number) => {
      const a = audioRef.current;
      const w = flatWords[wordIdx];
      if (!w) return;
      // Selecting a word also selects its containing phrase as the "active
      // segment" candidate so a subsequent Practice run captures that
      // segment without further input. Seek the audio if available.
      const phraseIdx = wordIdxToPhrase[wordIdx];
      if (phraseIdx >= 0) setSelectedPhraseIdx(phraseIdx);
      if (a) {
        a.currentTime = w.start;
        setCurrentTime(w.start);
      }
    },
    [flatWords, wordIdxToPhrase],
  );

  const handleTogglePhraseLoop = useCallback(
    (phraseIdx: number) => {
      setLoopPhraseIdx((prev) => {
        const next = prev === phraseIdx ? null : phraseIdx;
        const a = audioRef.current;
        if (next != null && a) {
          a.currentTime = phrases[next].startTime;
          setCurrentTime(phrases[next].startTime);
        }
        return next;
      });
      // Looping a phrase also selects it for practice.
      setSelectedPhraseIdx(phraseIdx);
    },
    [phrases],
  );

  const handleClearSelection = useCallback(() => {
    setSelectedPhraseIdx(null);
    setLoopPhraseIdx(null);
  }, []);

  const openWordDrill = useCallback(
    (wordIdx: number) => {
      lastWordTapIdxRef.current = null;
      handleSeekToWord(wordIdx);
      setDrillWordIdx(wordIdx);
      setDrillOpen(true);
    },
    [handleSeekToWord],
  );

  const onWordButtonClick = useCallback(
    (flatIdx: number) => {
      if (lastWordTapIdxRef.current === flatIdx) {
        openWordDrill(flatIdx);
        return;
      }
      lastWordTapIdxRef.current = flatIdx;
      handleSeekToWord(flatIdx);
    },
    [handleSeekToWord, openWordDrill],
  );

  // ── Practice (mic) handlers ─────────────────────────────────────────────
  const handleStop = useCallback(async () => {
    const mic = micRef.current;
    if (!mic) {
      setError("Microphone engine not initialized");
      return;
    }

    // Clear the auto-stop timer (in case the user hit Stop manually).
    if (segmentStopTimerRef.current) {
      clearTimeout(segmentStopTimerRef.current);
      segmentStopTimerRef.current = null;
    }

    console.log("✓ Stopping practice take...");
    mic.stop();
    setPracticeState("analyzing");

    let audioBlob: Blob | null = null;
    try {
      audioBlob = await mic.getPracticeBlob?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to get audio";
      setError(msg);
      setPracticeState("error");
      return;
    }

    if (!audioBlob) {
      setError("Failed to capture audio - no data captured");
      setPracticeState("error");
      return;
    }

    const span = segmentSpanRef.current;

    const formData = new FormData();
    formData.append("student", audioBlob);
    formData.append("aliyaNum", String(aliya.aliyaNum));
    formData.append("parasha", aliya.parasha);
    if (cantor) {
      // The API uses these to swap reference audio + word boundaries
      // and to build a cantor-isolated cache key on the python side.
      // Sending them is always safe — when they describe the default
      // cantor, the route just no-ops.
      formData.append("cantorId", cantor.id);
      formData.append("cantorAudio", cantor.audio);
      if (cantor.wordsJson) {
        formData.append("cantorWordsJson", cantor.wordsJson);
      }
    }
    if (span) {
      // Cantor-time window the student is meant to be re-singing. The
      // analyzer shifts student frame times by +segStart so its word
      // boundaries (which are in cantor time) line up with the student's
      // practice take (which starts at t=0).
      formData.append("segStart", String(span.startTime));
      formData.append("segEnd", String(span.endTime));
      formData.append("wordStart", String(span.startWord));
      formData.append("wordEnd", String(span.endWord));
    }

    try {
      const res = await fetch("/api/parasha/analyze", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Analysis failed");
      }

      const results = (await res.json()) as AnalysisResult;
      // Hold onto the practice take blob as an object URL so the results card can
      // play it back. Revoke any prior URL first to avoid leaks across takes.
      setStudentAudioUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(audioBlob);
      });
      setAnalysisResults(results);
      setPracticePhraseIdx(span ? span.phraseIdx : null);
      setPracticeState("done");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Analysis failed";
      setError(msg);
      setPracticeState("error");
    }
  }, [aliya, cantor]);

  const handleStart = useCallback(async () => {
    setError(null);
    setAnalysisResults(null);
    setPracticePhraseIdx(null);

    // Stop any cantor playback before opening the mic — we don't want the
    // cantor leaking into the student's mic.
    const a = audioRef.current;
    if (a && !a.paused) a.pause();

    const mic = micRef.current;
    if (!mic) {
      setError("Microphone engine not initialized");
      return;
    }

    // If a phrase is selected, lock in its span before starting so the
    // auto-stop timer & submit handler agree on the window.
    if (selectedPhraseIdx != null) {
      const p = phrases[selectedPhraseIdx];
      if (p) {
        segmentSpanRef.current = {
          startTime: p.startTime,
          endTime: p.endTime,
          startWord: p.startWord,
          endWord: p.endWord,
          phraseIdx: selectedPhraseIdx,
        };
      } else {
        segmentSpanRef.current = null;
      }
    } else {
      segmentSpanRef.current = null;
    }

    try {
      if (!mic.isRunning) await mic.start();
      practiceStartTimeRef.current = Date.now() / 1000;
      setCursorWordProgress(segmentSpanRef.current?.startWord ?? 0);
      setPracticeState("practicing");
      console.log(
        "✓ Practice started",
        segmentSpanRef.current
          ? `(segment ${segmentSpanRef.current.startTime.toFixed(2)}–${segmentSpanRef.current.endTime.toFixed(2)}s)`
          : "(full aliya)",
      );

      // Auto-stop a segment take one second past the segment's natural
      // duration. The +1s gives a comfortable tail for the student's last
      // syllable; longer than that and we're just capturing silence.
      const span = segmentSpanRef.current;
      if (span) {
        const ms = Math.max(500, (span.endTime - span.startTime) * 1000 + 1000);
        segmentStopTimerRef.current = setTimeout(() => {
          // Only auto-stop if we're still practicing (user didn't already stop).
          void handleStop();
        }, ms);
      }
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Could not access microphone.";
      setError(msg);
      setPracticeState("error");
    }
  }, [phrases, selectedPhraseIdx, handleStop]);

  const handleReset = useCallback(() => {
    setPracticeState("idle");
    setError(null);
    setAnalysisResults(null);
    setPracticeDuration(0);
    setPracticePhraseIdx(null);
    setCursorWordProgress(0);
    setStudentAudioUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    segmentSpanRef.current = null;
    if (segmentStopTimerRef.current) {
      clearTimeout(segmentStopTimerRef.current);
      segmentStopTimerRef.current = null;
    }
  }, []);

  // Revoke any outstanding student-audio object URL when this component
  // unmounts (e.g. switching aliya). The reset handler covers in-session
  // takes; this catches the "user navigates away" case.
  useEffect(() => {
    return () => {
      if (studentAudioUrl) URL.revokeObjectURL(studentAudioUrl);
    };
  }, [studentAudioUrl]);

  // ── Derived display values ──────────────────────────────────────────────
  const cursorWordIdx = Math.min(
    cursorWordProgress,
    flatWords.length - 1,
  );
  const cursorWord = flatWords[cursorWordIdx];
  const currentPhraseIdx =
    currentWordIdx >= 0 ? wordIdxToPhrase[currentWordIdx] : -1;

  const segmentDuration =
    selectedPhraseIdx != null
      ? phrases[selectedPhraseIdx].endTime - phrases[selectedPhraseIdx].startTime
      : aliya.duration;
  const practiceProgressPercent =
    practiceState === "practicing"
      ? Math.min(100, (practiceDuration / Math.max(0.001, segmentDuration)) * 100)
      : 0;

  // ── Show results card on success ────────────────────────────────────────
  if (practiceState === "done" && analysisResults) {
    const segmentInfo =
      practicePhraseIdx != null
        ? {
            startWord: phrases[practicePhraseIdx].startWord,
            endWord: phrases[practicePhraseIdx].endWord,
            label:
              `Verse ${phrases[practicePhraseIdx].verseRef}, ` +
              `${phrases[practicePhraseIdx].endsWith} phrase`,
          }
        : null;
    return (
      <AnalysisResultsCard
        results={analysisResults}
        aliya={aliya}
        scrollStyle={scrollStyle}
        onReset={handleReset}
        segmentInfo={segmentInfo}
        studentAudioUrl={studentAudioUrl}
      />
    );
  }

  const isPracticing = practiceState === "practicing";
  const isAnalyzing = practiceState === "analyzing";
  const isBusy = isPracticing || isAnalyzing;

  return (
    <Card className="border-primary/20 bg-card/80 shadow-md">
      <CardContent className="space-y-5 pt-6 pb-6">
        {/* Cantor audio (hidden — we use custom controls) */}
        <audio
          ref={audioRef}
          src={aliya.audio}
          preload="auto"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => {
            setIsPlaying(false);
            setCurrentTime(aliya.duration);
          }}
        />

        {/* Top row: status + play cantor + practice (or stop / analyzing / try again) */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
          <div>
            <p className="text-sm font-medium">
              {practiceState === "idle" &&
                (selectedPhraseIdx != null
                  ? `Ready: selected phrase (${segmentDuration.toFixed(1)}s)`
                  : "Ready: full aliya")}
              {isPracticing && "Practicing…"}
              {isAnalyzing && "Analyzing your performance..."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {practiceState === "idle" ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handlePlayPause}
                  aria-label={isPlaying ? "Pause" : "Play cantor"}
                >
                  {isPlaying ? (
                    <Pause className="size-4" />
                  ) : (
                    <Play className="size-4" />
                  )}
                  <span className="ml-1.5">
                    {isPlaying ? "Pause" : "Play cantor"}
                  </span>
                </Button>
                <Button size="sm" variant="default" onClick={handleStart}>
                  <Mic className="size-4" />
                  <span className="ml-1.5">Practice</span>
                </Button>
              </>
            ) : isPracticing ? (
              <Button size="sm" variant="destructive" onClick={handleStop}>
                <MicOff className="size-4" />
                <span className="ml-1.5">Stop</span>
              </Button>
            ) : isAnalyzing ? (
              <Button size="sm" variant="outline" disabled>
                <Loader2 className="size-4 animate-spin" />
                <span className="ml-1.5">Analyzing...</span>
              </Button>
            ) : practiceState === "error" ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handlePlayPause}
                  aria-label={isPlaying ? "Pause" : "Play cantor"}
                >
                  {isPlaying ? (
                    <Pause className="size-4" />
                  ) : (
                    <Play className="size-4" />
                  )}
                  <span className="ml-1.5">
                    {isPlaying ? "Pause" : "Play cantor"}
                  </span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleReset}
                  title="Reset and try again"
                >
                  <RotateCcw className="size-4" />
                  <span className="ml-1.5">Try again</span>
                </Button>
              </>
            ) : null}
          </div>
        </div>

        {/* Listen-mode transport row (cantor playback). Hidden while
            practicing / analyzing so we don't leak audio into the mic and
            so the controls aren't a distraction mid-take. */}
        {!isBusy && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
            <div className="flex items-center gap-2">
              {(selectedPhraseIdx != null || loopPhraseIdx != null) && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={handleClearSelection}
                  aria-label="Clear selection"
                  title="Clear phrase selection (practice full aliya)"
                >
                  Clear selection
                </Button>
              )}
            </div>

            <div className="flex items-center gap-1 text-xs">
              <span className="text-muted-foreground mr-1">Speed:</span>
              {SPEED_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  type="button"
                  size="sm"
                  variant={speed === opt.value ? "default" : "outline"}
                  className="h-7 px-2 text-xs"
                  onClick={() => setSpeed(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Cantor playback progress (Listen-mode style). Hidden during
            practice take — we show the progress bar instead. */}
        {!isBusy && (
          <div className="space-y-1">
            <div className="bg-muted relative h-1.5 w-full overflow-hidden rounded-full">
              <div
                className="bg-primary absolute inset-y-0 left-0 transition-[width] duration-75"
                style={{
                  width: `${Math.min(100, (currentTime / Math.max(aliya.duration, 0.001)) * 100)}%`,
                }}
              />
              {selectedPhraseIdx != null ? (
                <div
                  className="bg-primary/30 absolute inset-y-0"
                  style={{
                    left: `${(phrases[selectedPhraseIdx].startTime / aliya.duration) * 100}%`,
                    width: `${((phrases[selectedPhraseIdx].endTime - phrases[selectedPhraseIdx].startTime) / aliya.duration) * 100}%`,
                  }}
                />
              ) : null}
            </div>
            <div className="text-muted-foreground flex justify-between text-[0.7rem] tabular-nums">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(aliya.duration)}</span>
            </div>
          </div>
        )}

        {error ? <p className="text-destructive text-sm">{error}</p> : null}

        {/* Practice progress (only while the mic is on) */}
        {isPracticing && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                Now reading:{" "}
                <span className="font-hebrew text-sm" dir="rtl" lang="he">
                  {cursorWord?.text ?? "—"}
                </span>
              </span>
              <span className="tabular-nums font-mono text-xs">
                {practiceDuration.toFixed(1)}s / {segmentDuration.toFixed(1)}s
              </span>
            </div>
            <div className="bg-muted relative h-2 w-full overflow-hidden rounded-full">
              <div
                className="bg-primary absolute inset-y-0 left-0 transition-[width] duration-200"
                style={{ width: `${practiceProgressPercent}%` }}
              />
            </div>
          </div>
        )}

        {isAnalyzing && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground text-center">
              Processing your practice… This should take 2-5 seconds.
            </p>
            <div className="bg-muted relative h-2 w-full overflow-hidden rounded-full">
              <div className="bg-primary absolute inset-y-0 left-0 h-full w-full animate-pulse" />
            </div>
          </div>
        )}

        {/* Verses + words display.
            – Idle: first tap = select phrase + seek; second tap on same word =
              word drill. Phrase <Repeat> buttons toggle loop. Practicing / analyzing:
              static read-along with a cursor. */}
        <div className="space-y-5" dir="rtl" lang="he">
          {aliya.verses.map((verse) => {
            const versePhrases = phrases.filter((p) => p.verseRef === verse.ref);
            return (
              <div key={verse.ref} className="space-y-1">
                <div
                  className="text-muted-foreground flex items-center gap-2 text-[0.7rem] tabular-nums"
                  dir="ltr"
                >
                  <span className="bg-muted rounded px-1.5 py-0.5 font-mono">
                    Gen {verse.ref}
                  </span>
                </div>
                <p
                  className={cn(
                    "font-hebrew tracking-tight",
                    showTranslit
                      ? "text-2xl leading-snug sm:text-3xl md:text-4xl"
                      : "text-2xl leading-loose sm:text-3xl md:text-4xl",
                  )}
                  aria-label={`Verse ${verse.ref}`}
                >
                  {versePhrases.map((p, pIdxInVerse) => {
                    const phraseIdx = phrases.indexOf(p);
                    const phraseWords = flatWords.slice(
                      p.startWord,
                      p.endWord + 1,
                    );
                    const isLoopedPhrase = loopPhraseIdx === phraseIdx;
                    const isActivePhrase =
                      currentPhraseIdx === phraseIdx && !isBusy;
                    const isSelectedPhrase =
                      selectedPhraseIdx === phraseIdx && !isLoopedPhrase;

                    return (
                      <span
                        key={`${verse.ref}-p${pIdxInVerse}`}
                        className={cn(
                          "rounded-md px-1 py-0.5 transition-colors",
                          showTranslit && "align-top",
                          isLoopedPhrase
                            ? "bg-primary/10 ring-primary/40 ring-1"
                            : isSelectedPhrase
                              ? "bg-primary/5 ring-primary/30 ring-1"
                              : isActivePhrase
                                ? "bg-accent/40"
                                : "",
                        )}
                      >
                        {phraseWords.map((word, wi) => {
                          const flatIdx = p.startWord + wi;
                          const isCurrent =
                            !isBusy && flatIdx === currentWordIdx;
                          const isCursor = isPracticing && flatIdx === cursorWordIdx;
                          const display = scrollStyle ? word.plain : word.text;
                          const tappable = !isBusy;

                          const inner = (
                            <>
                              <span>{display}</span>
                              {showTranslit && word.translit ? (
                                <span
                                  dir="ltr"
                                  lang="en"
                                  className={cn(
                                    "font-sans text-[0.5em] leading-tight tracking-normal",
                                    isCurrent
                                      ? "text-primary-foreground/80"
                                      : "text-muted-foreground",
                                  )}
                                >
                                  {word.translit}
                                </span>
                              ) : null}
                            </>
                          );

                          const className = cn(
                            "mx-[1px] rounded px-0.5 transition-colors",
                            showTranslit
                              ? "inline-flex flex-col items-center align-top leading-tight"
                              : "inline-block",
                            tappable &&
                              "hover:bg-primary/15 hover:text-primary focus-visible:bg-primary/15 focus-visible:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            isCurrent &&
                              "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                            isCursor &&
                              "bg-primary/15 text-primary ring-primary ring-2",
                          );

                          return tappable ? (
                            <button
                              key={`${verse.ref}-w${flatIdx}`}
                              type="button"
                              onClick={() => onWordButtonClick(flatIdx)}
                              className={className}
                              title={`First click: select phrase & seek · Second click: word practice`}
                              aria-label={`Word ${flatIdx + 1} of ${flatWords.length}${
                                word.translit ? `: ${word.translit}` : ""
                              }`}
                            >
                              {inner}
                            </button>
                          ) : (
                            <span
                              key={`${verse.ref}-w${flatIdx}`}
                              className={className}
                            >
                              {inner}
                            </span>
                          );
                        })}
                        {/* Phrase-end loop button (Listen-style). Hidden while
                            practice so the read-along stays clean. */}
                        {!isBusy && (
                          <button
                            type="button"
                            onClick={() => handleTogglePhraseLoop(phraseIdx)}
                            className={cn(
                              "mx-1 inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-primary/15 hover:text-primary focus-visible:bg-primary/15 focus-visible:text-primary focus-visible:outline-none",
                              "align-middle text-xs",
                              isLoopedPhrase && "text-primary bg-primary/15",
                            )}
                            aria-label={
                              isLoopedPhrase
                                ? `Stop looping ${p.endsWith} phrase`
                                : `Loop this phrase (ends with ${p.endsWith})`
                            }
                            title={
                              isLoopedPhrase
                                ? "Stop looping this phrase"
                                : `Loop this phrase (ends with ${p.endsWith})`
                            }
                          >
                            <Repeat className="size-3" />
                          </button>
                        )}
                      </span>
                    );
                  })}
                </p>
              </div>
            );
          })}
        </div>

        <p className="text-muted-foreground border-t pt-3 text-center text-xs">
          First tap a word to select its phrase; tap the same word again to open
          word practice. Use <Repeat className="inline size-3" /> to loop a
          phrase. Hit <Mic className="inline size-3" /> to practice the aliya.
          With a phrase selected, only that phrase is captured and scored against
          the cantor&apos;s matching segment.
        </p>
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
        cantor={cantor}
      />
    </Card>
  );
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

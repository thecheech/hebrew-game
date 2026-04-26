"use client";

import {
  Loader2,
  Mic,
  MicOff,
  Play,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PitchContourOverlay } from "@/components/pitch-contour-overlay";
import {
  type ParashaWord,
  type WordDrillResult,
} from "@/lib/parasha-types";
import type { CantorScoringRef } from "@/components/parasha-lead-mode";
import { MicPitchEngine } from "@/lib/pitch";
import { cn } from "@/lib/utils";

interface WordDrillModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parasha: string;
  aliyaNum: number;
  /** Public path to the aliya audio (e.g. "/parasha/miketz/audio/aliya1.mp3"). */
  audioSrc: string;
  /** Flat list of all words in the aliya. */
  words: ParashaWord[];
  /** Word index to open on. */
  initialWordIdx: number;
  /** Whether to show the trope-stripped consonants only. */
  scrollStyle?: boolean;
  /** Cantor scoring reference. Forwarded to /api/parasha/analyze-word so
   *  per-word drills score against the same cantor as the aliya recording.
   *  Null means "use the API's default cantor reference." */
  cantor?: CantorScoringRef | null;
}

type DrillState =
  | "idle"
  | "listening"
  | "recording"
  | "analyzing"
  | "scored"
  | "error";

type Verdict = "green" | "yellow" | "red";

const MAX_RECORD_SECONDS = 5;
const HISTORY_LEN = 3;

/**
 * Word-level practice modal. Opens on a single word; the user can:
 *   • Listen — plays the cantor's slice for that word
 *   • Record — captures their attempt at the same word, then scores it
 *   • Try again, navigate prev/next, see last-3 attempt history
 *
 * Auto-advances to the next word ~1.2s after a green verdict.
 */
export function WordDrillModal({
  open,
  onOpenChange,
  parasha,
  aliyaNum,
  audioSrc,
  words,
  initialWordIdx,
  scrollStyle = false,
  cantor = null,
}: WordDrillModalProps) {
  const [wordIdx, setWordIdx] = useState(initialWordIdx);
  const [state, setState] = useState<DrillState>("idle");
  const [result, setResult] = useState<WordDrillResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recordedDuration, setRecordedDuration] = useState(0);
  // History of verdicts per word index, capped at HISTORY_LEN entries each.
  const [history, setHistory] = useState<Record<number, Verdict[]>>({});

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const micRef = useRef<MicPitchEngine | null>(null);
  const listenStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingStartRef = useRef<number>(0);
  const recordingTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingMaxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const word = words[wordIdx];
  const display = useMemo(
    () => (scrollStyle ? word?.plain : word?.text) ?? "",
    [word, scrollStyle]
  );

  // Reset transient state when the user opens a different word
  useEffect(() => {
    if (!open) return;
    setWordIdx(initialWordIdx);
  }, [open, initialWordIdx]);

  // Reset per-word transient state when wordIdx changes
  useEffect(() => {
    setState("idle");
    setResult(null);
    setError(null);
    setRecordedDuration(0);
    cancelAdvance();
    stopListenPlayback();
    stopRecordingTickers();
  }, [wordIdx]);

  // Lazy-init the mic engine the first time the modal opens
  useEffect(() => {
    if (!open) return;
    if (!micRef.current) {
      micRef.current = new MicPitchEngine();
    }
  }, [open]);

  // Tear everything down on close
  useEffect(() => {
    if (open) return;
    stopListenPlayback();
    stopRecordingTickers();
    cancelAdvance();
    if (micRef.current) {
      micRef.current.stop();
    }
  }, [open]);

  // Tear it all down on unmount too
  useEffect(() => {
    return () => {
      stopListenPlayback();
      stopRecordingTickers();
      cancelAdvance();
      if (micRef.current) {
        micRef.current.stop();
        micRef.current = null;
      }
    };
  }, []);

  function cancelAdvance() {
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
  }

  function stopListenPlayback() {
    if (listenStopTimerRef.current) {
      clearTimeout(listenStopTimerRef.current);
      listenStopTimerRef.current = null;
    }
    const a = audioRef.current;
    if (a && !a.paused) {
      a.pause();
    }
  }

  function stopRecordingTickers() {
    if (recordingTickRef.current) {
      clearInterval(recordingTickRef.current);
      recordingTickRef.current = null;
    }
    if (recordingMaxTimerRef.current) {
      clearTimeout(recordingMaxTimerRef.current);
      recordingMaxTimerRef.current = null;
    }
  }

  const handleListen = useCallback(() => {
    if (!word) return;
    const a = audioRef.current;
    if (!a) return;

    stopListenPlayback();
    setState("listening");

    a.currentTime = word.start;
    void a.play().catch(() => {
      // Autoplay rejection or load error — fall back to idle silently.
      setState("idle");
    });

    // The <audio> element's currentTime advances naturally; we set a timer
    // to pause exactly when the word ends (plus a tiny tail for naturalness).
    const durationMs = Math.max(150, (word.end - word.start) * 1000 + 80);
    listenStopTimerRef.current = setTimeout(() => {
      const el = audioRef.current;
      if (el && !el.paused) el.pause();
      setState((s) => (s === "listening" ? "idle" : s));
    }, durationMs);
  }, [word]);

  const handleStartRecording = useCallback(async () => {
    if (!micRef.current) return;
    setError(null);
    setResult(null);
    setRecordedDuration(0);

    try {
      stopListenPlayback();
      if (!micRef.current.isRunning) await micRef.current.start();
      recordingStartRef.current = Date.now() / 1000;
      setState("recording");

      // UI ticker
      recordingTickRef.current = setInterval(() => {
        const elapsed = Date.now() / 1000 - recordingStartRef.current;
        setRecordedDuration(elapsed);
      }, 100);

      // Hard cap so the user can't accidentally record a 5-minute take.
      recordingMaxTimerRef.current = setTimeout(() => {
        void handleStopRecording();
      }, MAX_RECORD_SECONDS * 1000);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not access microphone."
      );
      setState("error");
    }
    // handleStopRecording is defined below; we intentionally read it via the
    // ref to handleStopRecording at call time. Define-once-and-use pattern
    // to avoid a circular dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStopRecording = useCallback(async () => {
    const mic = micRef.current;
    if (!mic) return;
    stopRecordingTickers();
    mic.stop();
    setState("analyzing");

    let blob: Blob | null = null;
    try {
      blob = await mic.getRecordingBlob?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to capture audio");
      setState("error");
      return;
    }

    if (!blob) {
      setError("No audio captured. Try recording again.");
      setState("error");
      return;
    }

    const fd = new FormData();
    fd.append("student", blob);
    fd.append("parasha", parasha);
    fd.append("aliyaNum", String(aliyaNum));
    fd.append("wordIdx", String(wordIdx));
    if (cantor) {
      fd.append("cantorId", cantor.id);
      fd.append("cantorAudio", cantor.audio);
      if (cantor.wordsJson) {
        fd.append("cantorWordsJson", cantor.wordsJson);
      }
    }

    try {
      const res = await fetch("/api/parasha/analyze-word", {
        method: "POST",
        body: fd,
      });
      const data = (await res.json()) as WordDrillResult;
      if (!res.ok || data.status !== "success") {
        throw new Error(data.error || "Analysis failed");
      }
      setResult(data);
      setState("scored");

      const verdict = data.word_score?.verdict;
      if (verdict === "green" || verdict === "yellow" || verdict === "red") {
        setHistory((h) => {
          const prev = h[wordIdx] ?? [];
          const next = [...prev, verdict].slice(-HISTORY_LEN);
          return { ...h, [wordIdx]: next };
        });
      }

      // Intentionally do NOT auto-advance on a green verdict. Practising a
      // word until you can repeat it cleanly is more useful than getting
      // bumped forward, and an unexpected jump to the next word makes it
      // hard to compare two attempts on the same word side-by-side.
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
      setState("error");
    }
  }, [parasha, aliyaNum, wordIdx, words.length, cantor]);

  const handleTryAgain = useCallback(() => {
    cancelAdvance();
    setState("idle");
    setResult(null);
    setError(null);
    setRecordedDuration(0);
  }, []);

  const goPrev = useCallback(() => {
    setWordIdx((i) => Math.max(0, i - 1));
  }, []);
  const goNext = useCallback(() => {
    setWordIdx((i) => Math.min(words.length - 1, i + 1));
  }, [words.length]);

  if (!word) return null;

  const verdict = result?.word_score?.verdict ?? null;
  const mae = result?.word_score?.mae ?? null;
  const pronunciation = result?.word_score?.pronunciation ?? null;
  const pronunciationVerdict = pronunciation?.verdict ?? null;
  const pronunciationDistance = pronunciation?.distance ?? null;
  const wordHistory = history[wordIdx] ?? [];
  const isBusy = state === "recording" || state === "analyzing";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2">
            <span>Word Drill</span>
            <span className="text-muted-foreground font-mono text-xs font-normal tabular-nums">
              {wordIdx + 1} / {words.length}
            </span>
          </DialogTitle>
          <DialogDescription>
            Listen to the cantor, then record yourself singing this single
            word. We'll score the pitch shape.
          </DialogDescription>
        </DialogHeader>

        {/* Hidden audio element used to play just this word's slice */}
        <audio ref={audioRef} src={audioSrc} preload="auto" />

        {/* The Hebrew word itself */}
        <div className="bg-muted/50 flex min-h-32 flex-col items-center justify-center rounded-lg p-6">
          <div dir="rtl" lang="he">
            <span className="font-hebrew text-5xl leading-none">{display}</span>
          </div>
          {word?.translit && (
            <div className="text-muted-foreground mt-2 text-sm">
              {word.translit}
            </div>
          )}
        </div>

        {/* Transport row */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            variant="secondary"
            size="lg"
            onClick={handleListen}
            disabled={isBusy}
          >
            <Play className="size-4" />
            <span className="ml-1.5">Listen</span>
          </Button>

          {state === "recording" ? (
            <Button
              variant="destructive"
              size="lg"
              onClick={() => void handleStopRecording()}
            >
              <MicOff className="size-4" />
              <span className="ml-1.5">
                Stop ({recordedDuration.toFixed(1)}s)
              </span>
            </Button>
          ) : state === "analyzing" ? (
            <Button variant="outline" size="lg" disabled>
              <Loader2 className="size-4 animate-spin" />
              <span className="ml-1.5">Analyzing…</span>
            </Button>
          ) : (
            <Button
              variant="default"
              size="lg"
              onClick={() => void handleStartRecording()}
            >
              <Mic className="size-4" />
              <span className="ml-1.5">Record</span>
            </Button>
          )}

          {state === "scored" && (
            <Button variant="outline" size="lg" onClick={handleTryAgain}>
              <RotateCcw className="size-4" />
              <span className="ml-1.5">Try again</span>
            </Button>
          )}
        </div>

        {error && (
          <p className="text-destructive text-center text-sm">{error}</p>
        )}

        {/* Score readout */}
        {state === "scored" && result?.word_score && (
          <div className="space-y-3">
            {/* Two pills: pitch (left) and pronunciation (right). Each has
                its own verdict, color, and numeric readout — they're scored
                from different signals (F0 vs MFCC) so it's normal for them
                to disagree, e.g. "right notes, wrong word." */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="flex flex-col items-center gap-1">
                <span className="text-muted-foreground text-[10px] uppercase tracking-wide">
                  Pitch
                </span>
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-sm font-medium",
                    verdict === "green" &&
                      "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
                    verdict === "yellow" &&
                      "bg-amber-500/20 text-amber-700 dark:text-amber-300",
                    verdict === "red" &&
                      "bg-rose-500/20 text-rose-700 dark:text-rose-300",
                    !verdict && "bg-muted text-muted-foreground"
                  )}
                >
                  {verdict === "green"
                    ? "On key"
                    : verdict === "yellow"
                      ? "Close"
                      : verdict === "red"
                        ? "Off pitch"
                        : "No data"}
                </span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {mae == null ? "—" : `${mae.toFixed(2)} st off`}
                </span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="text-muted-foreground text-[10px] uppercase tracking-wide">
                  Pronunciation
                </span>
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-sm font-medium",
                    pronunciationVerdict === "green" &&
                      "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
                    pronunciationVerdict === "yellow" &&
                      "bg-amber-500/20 text-amber-700 dark:text-amber-300",
                    pronunciationVerdict === "red" &&
                      "bg-rose-500/20 text-rose-700 dark:text-rose-300",
                    !pronunciationVerdict &&
                      "bg-muted text-muted-foreground"
                  )}
                >
                  {pronunciationVerdict === "green"
                    ? "Clear"
                    : pronunciationVerdict === "yellow"
                      ? "Close"
                      : pronunciationVerdict === "red"
                        ? "Unclear"
                        : "No data"}
                </span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {pronunciationDistance == null
                    ? "—"
                    : `dist ${pronunciationDistance.toFixed(2)}`}
                </span>
              </div>
            </div>

            {/* Pitch contour overlay (cantor in solid, student in dashed). */}
            <PitchContourOverlay
              reference={result.reference_contour ?? []}
              student={result.student_contour ?? []}
            />

            <div className="text-muted-foreground flex items-center justify-between text-xs">
              <span>Tonic (you / cantor)</span>
              <span className="font-mono tabular-nums">
                {result.student_tonic_hz?.toFixed(0) ?? "—"} /{" "}
                {result.reference_tonic_hz?.toFixed(0) ??
                  result.tonic_hz?.toFixed(0) ??
                  "—"}{" "}
                Hz
              </span>
            </div>
          </div>
        )}

        {/* Last-3 attempt history dots */}
        {wordHistory.length > 0 && (
          <div className="text-muted-foreground flex items-center justify-center gap-1 text-xs">
            <span className="mr-1">Recent:</span>
            {wordHistory.map((v, i) => (
              <span
                key={i}
                className={cn(
                  "h-2 w-2 rounded-full",
                  v === "green" && "bg-emerald-500",
                  v === "yellow" && "bg-amber-500",
                  v === "red" && "bg-rose-500"
                )}
                title={v}
              />
            ))}
          </div>
        )}

        {/* Footer nav */}
        <div className="border-t pt-3">
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={goPrev}
              disabled={wordIdx <= 0 || isBusy}
            >
              <ChevronLeft className="size-4" />
              <span className="ml-1">Prev</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              <X className="size-4" />
              <span className="ml-1">Done</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={goNext}
              disabled={wordIdx >= words.length - 1 || isBusy}
            >
              <span className="mr-1">Next</span>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


"use client";

import {
  Pause,
  Play,
  Repeat,
  RotateCcw,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  type AliyaData,
  buildPhrases,
  type ParashaWord,
} from "@/lib/parasha-types";
import { cn } from "@/lib/utils";

interface ParashaKaraokeProps {
  aliya: AliyaData;
  /** When true, render words stripped of vowels and te'amim (Torah-scroll style). */
  scrollStyle: boolean;
  /** When true, render Latin transliteration under each Hebrew word. */
  showTranslit: boolean;
}

const SPEED_OPTIONS = [
  { value: 0.5, label: "0.5×" },
  { value: 0.75, label: "0.75×" },
  { value: 1, label: "1×" },
];

/** Treat very short clips (< 0.05s) as "instantaneous markers" so we don't strobe. */
const MIN_HIGHLIGHT_DURATION = 0.05;

export function ParashaKaraoke({
  aliya,
  scrollStyle,
  showTranslit,
}: ParashaKaraokeProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [loopPhraseIdx, setLoopPhraseIdx] = useState<number | null>(null);

  const phrases = useMemo(() => buildPhrases(aliya), [aliya]);

  // Flatten verses to a single word array; word index ↔ position in array.
  const flatWords = useMemo(() => {
    const out: Array<{ word: ParashaWord; verseRef: string; verseIdx: number; wordInVerseIdx: number }> = [];
    aliya.verses.forEach((v, vi) => {
      v.words.forEach((w, wi) => {
        out.push({ word: w, verseRef: v.ref, verseIdx: vi, wordInVerseIdx: wi });
      });
    });
    return out;
  }, [aliya]);

  // Map word index → phrase index.
  const wordIdxToPhrase = useMemo(() => {
    const map = new Array<number>(flatWords.length).fill(-1);
    phrases.forEach((p, pi) => {
      for (let i = p.startWord; i <= p.endWord; i++) map[i] = pi;
    });
    return map;
  }, [flatWords.length, phrases]);

  // Current word index by binary search on `start` time.
  const currentWordIdx = useMemo(() => {
    if (flatWords.length === 0) return -1;
    // Find last word whose start <= currentTime
    let lo = 0;
    let hi = flatWords.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (flatWords[mid].word.start <= currentTime + 0.001) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (ans < 0) return -1;
    // If currentTime is past the end of `ans`'s word AND the gap to the next is meaningful, drop highlight.
    const w = flatWords[ans].word;
    if (currentTime > w.end + MIN_HIGHLIGHT_DURATION && ans + 1 < flatWords.length) {
      // We're between words — keep highlighting the previous one (more pleasant than blank).
      return ans;
    }
    return ans;
  }, [currentTime, flatWords]);

  // Sync `audio.playbackRate` with state.
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed]);

  // RAF loop while playing — gives ~60Hz highlight updates instead of ~4Hz `timeupdate`.
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
      // Phrase looping: when we cross the end of the looped phrase, jump back to its start.
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

  // Reset internal state when the aliya prop changes.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.pause();
    a.currentTime = 0;
    setCurrentTime(0);
    setIsPlaying(false);
    setLoopPhraseIdx(null);
  }, [aliya.audio]);

  const handlePlayPause = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      void a.play();
    } else {
      a.pause();
    }
  }, []);

  const handleRestart = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = loopPhraseIdx != null ? phrases[loopPhraseIdx].startTime : 0;
    setCurrentTime(a.currentTime);
  }, [loopPhraseIdx, phrases]);

  const handleSeekToWord = useCallback(
    (wordIdx: number) => {
      const a = audioRef.current;
      if (!a) return;
      const w = flatWords[wordIdx]?.word;
      if (!w) return;
      a.currentTime = w.start;
      setCurrentTime(w.start);
      // Selecting a word also picks its phrase as the active loop candidate (but doesn't engage looping).
    },
    [flatWords],
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
    },
    [phrases],
  );

  const currentPhraseIdx =
    currentWordIdx >= 0 ? wordIdxToPhrase[currentWordIdx] : -1;

  return (
    <Card className="border-primary/20 bg-card/80 shadow-md">
      <CardContent className="space-y-5 pt-6 pb-6">
        {/* Audio element (hidden — we use custom controls) */}
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

        {/* Transport controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="default"
              onClick={handlePlayPause}
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <Pause className="size-4" />
              ) : (
                <Play className="size-4" />
              )}
              <span className="ml-1.5">{isPlaying ? "Pause" : "Play"}</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleRestart}
              aria-label="Restart"
            >
              <RotateCcw className="size-4" />
              <span className="ml-1.5">
                {loopPhraseIdx != null ? "Restart phrase" : "Restart"}
              </span>
            </Button>
            {loopPhraseIdx != null ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setLoopPhraseIdx(null)}
                aria-label="Exit phrase loop"
              >
                Exit loop
              </Button>
            ) : null}
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

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="bg-muted relative h-1.5 w-full overflow-hidden rounded-full">
            <div
              className="bg-primary absolute inset-y-0 left-0 transition-[width] duration-75"
              style={{
                width: `${Math.min(100, (currentTime / Math.max(aliya.duration, 0.001)) * 100)}%`,
              }}
            />
            {loopPhraseIdx != null ? (
              <div
                className="bg-primary/30 absolute inset-y-0"
                style={{
                  left: `${(phrases[loopPhraseIdx].startTime / aliya.duration) * 100}%`,
                  width: `${((phrases[loopPhraseIdx].endTime - phrases[loopPhraseIdx].startTime) / aliya.duration) * 100}%`,
                }}
              />
            ) : null}
          </div>
          <div className="text-muted-foreground flex justify-between text-[0.7rem] tabular-nums">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(aliya.duration)}</span>
          </div>
        </div>

        {/* Verses + words */}
        <div className="space-y-5" dir="rtl" lang="he">
          {aliya.verses.map((verse) => {
            // Render each verse as a sequence of phrase chunks for cleaner layout
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
                    const phraseWords = flatWords.slice(p.startWord, p.endWord + 1);
                    const isLoopedPhrase = loopPhraseIdx === phraseIdx;
                    const isActivePhrase = currentPhraseIdx === phraseIdx;
                    return (
                      <span
                        key={`${verse.ref}-p${pIdxInVerse}`}
                        className={cn(
                          "rounded-md px-1 py-0.5 transition-colors",
                          showTranslit && "align-top",
                          isLoopedPhrase
                            ? "bg-primary/10 ring-primary/40 ring-1"
                            : isActivePhrase
                              ? "bg-accent/40"
                              : "",
                        )}
                      >
                        {phraseWords.map(({ word }, wi) => {
                          const flatIdx = p.startWord + wi;
                          const isCurrent = flatIdx === currentWordIdx;
                          const display = scrollStyle ? word.plain : word.text;
                          return (
                            <button
                              key={`${verse.ref}-w${flatIdx}`}
                              type="button"
                              onClick={() => handleSeekToWord(flatIdx)}
                              onDoubleClick={() => handleTogglePhraseLoop(phraseIdx)}
                              className={cn(
                                "mx-[1px] rounded px-0.5 transition-colors",
                                showTranslit
                                  ? "inline-flex flex-col items-center align-top leading-tight"
                                  : "inline-block",
                                "hover:bg-primary/15 hover:text-primary focus-visible:bg-primary/15 focus-visible:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                isCurrent &&
                                  "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                              )}
                              title={`Click: jump here · Double-click: loop this phrase (${p.endsWith})`}
                              aria-label={`Word ${flatIdx + 1} of ${flatWords.length}${
                                word.translit ? `: ${word.translit}` : ""
                              }`}
                            >
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
                            </button>
                          );
                        })}
                        {/* Phrase-end loop button (small, only visible on hover/focus) */}
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
                      </span>
                    );
                  })}
                </p>
              </div>
            );
          })}
        </div>

        <p className="text-muted-foreground border-t pt-3 text-center text-[0.7rem]">
          Tap a word to jump to it · Double-tap a word, or tap{" "}
          <Repeat className="inline size-3" /> after a phrase, to loop just that
          phrase. Audio: PocketTorah, Ashkenazi nusach.
        </p>
      </CardContent>
    </Card>
  );
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

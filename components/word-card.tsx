"use client";

import { useMemo, useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getHebrewBaseLetter,
  getLetterLesson,
  getNikudLesson,
  segmentHebrewWord,
  type LetterExample,
} from "@/lib/letter-lessons";
import type { WordEntry } from "@/lib/words";

interface WordCardProps {
  entry: WordEntry | null;
  /** When true, reveal the transliteration + English meaning (after answering). */
  reveal?: boolean;
}

type Selection =
  | { kind: "letter"; segment: string }
  | { kind: "nikud"; mark: string }
  | null;

export function WordCard({ entry, reveal = false }: WordCardProps) {
  const [selected, setSelected] = useState<Selection>(null);
  const hebrew = entry?.hebrew ?? "";
  const segments = useMemo(() => segmentHebrewWord(hebrew), [hebrew]);

  const letterLesson = useMemo(
    () =>
      selected?.kind === "letter" ? getLetterLesson(selected.segment) : null,
    [selected],
  );
  const nikudLesson = useMemo(
    () => (selected?.kind === "nikud" ? getNikudLesson(selected.mark) : null),
    [selected],
  );

  if (!entry) return null;
  const meaning = entry.english.join(", ");
  const dialogOpen = Boolean(letterLesson || nikudLesson);

  return (
    <>
      <Card className="border-primary/20 bg-card/80 shadow-md">
        <CardContent className="flex flex-col items-center gap-3 pt-8 pb-8">
          <p
            className="font-hebrew text-center text-5xl leading-tight tracking-tight sm:text-6xl md:text-7xl"
            dir="rtl"
            lang="he"
            aria-label={`Hebrew word: ${entry.hebrew}`}
          >
            {segments.map((segment, idx) => {
              const base = getHebrewBaseLetter(segment);
              if (!base) {
                return (
                  <span key={`${segment}-${idx}`} aria-hidden="true">
                    {segment}
                  </span>
                );
              }

              return (
                <button
                  key={`${segment}-${idx}`}
                  type="button"
                  className="hover:text-primary focus-visible:ring-ring inline rounded-sm px-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2"
                  aria-label={`Learn letter ${segment}`}
                  onClick={() => setSelected({ kind: "letter", segment })}
                >
                  {segment}
                </button>
              );
            })}
          </p>

          {reveal ? (
            <div className="flex flex-col items-center gap-1">
              <p className="text-foreground text-base font-medium tabular-nums sm:text-lg">
                {entry.translit}
              </p>
              {meaning ? (
                <p className="text-muted-foreground text-xs sm:text-sm">
                  meaning: {meaning}
                </p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          {letterLesson ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  <span>{letterLesson.name}</span>
                  <span
                    className="font-hebrew text-2xl leading-none"
                    dir="rtl"
                    lang="he"
                  >
                    {letterLesson.baseLetter}
                    {letterLesson.finalForm
                      ? ` ${letterLesson.finalForm}`
                      : ""}
                  </span>
                </DialogTitle>
                <DialogDescription>
                  Sound: {letterLesson.sound}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                {letterLesson.finalForm ? (
                  <div className="bg-muted/40 rounded-md border px-3 py-2">
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Forms
                    </p>
                    <ul className="space-y-0.5">
                      <li className="flex items-baseline gap-2">
                        <span
                          className="font-hebrew text-xl"
                          dir="rtl"
                          lang="he"
                        >
                          {letterLesson.baseLetter}
                        </span>
                        <span className="text-muted-foreground">
                          regular (start / middle of a word)
                        </span>
                      </li>
                      <li className="flex items-baseline gap-2">
                        <span
                          className="font-hebrew text-xl"
                          dir="rtl"
                          lang="he"
                        >
                          {letterLesson.finalForm}
                        </span>
                        <span className="text-muted-foreground">
                          final form (end of a word)
                        </span>
                      </li>
                    </ul>
                  </div>
                ) : null}
                <p className="text-muted-foreground">
                  {letterLesson.description}
                </p>
                <ExamplesList examples={letterLesson.examples} />
              </div>
            </>
          ) : null}

          {nikudLesson ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  <span>{nikudLesson.name}</span>
                  <span
                    className="font-hebrew text-2xl leading-none"
                    dir="rtl"
                    lang="he"
                  >
                    {nikudLesson.display}
                  </span>
                </DialogTitle>
                <DialogDescription>
                  Sound: {nikudLesson.sound}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <p className="text-muted-foreground">
                  {nikudLesson.description}
                </p>
                <ExamplesList examples={nikudLesson.examples} />
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

interface ExamplesListProps {
  examples: LetterExample[];
}

function ExamplesList({ examples }: ExamplesListProps) {
  if (examples.length === 0) return null;
  return (
    <div>
      <p className="mb-2 font-medium">Quick examples:</p>
      <ul className="space-y-1.5">
        {examples.map((example) => (
          <li
            key={`${example.hebrew}-${example.translit}`}
            className="flex flex-wrap items-center gap-2"
          >
            <span aria-hidden="true" className="text-xl leading-none">
              {example.emoji}
            </span>
            <span className="font-hebrew text-lg" dir="rtl" lang="he">
              {example.hebrew}
            </span>
            <span className="text-muted-foreground tabular-nums">
              {example.translit}
            </span>
            <span className="text-muted-foreground">— {example.english}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

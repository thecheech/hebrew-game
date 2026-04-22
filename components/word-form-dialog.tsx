"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LEVEL_COUNT } from "@/lib/levels";
import type { WordDraft } from "@/lib/word-overrides";
import type { WordEntry, WordDifficulty } from "@/lib/words";
import { cn } from "@/lib/utils";

export type WordFormMode =
  | { kind: "create"; defaultLevel: number }
  | { kind: "edit-custom"; id: string; entry: WordEntry }
  | { kind: "edit-bundled"; entry: WordEntry };

interface WordFormDialogProps {
  open: boolean;
  mode: WordFormMode | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (draft: WordDraft) => void;
}

interface FormState {
  hebrew: string;
  translit: string;
  englishCsv: string;
  difficulty: WordDifficulty;
  level: number;
}

function modeToInitial(mode: WordFormMode): FormState {
  if (mode.kind === "create") {
    return {
      hebrew: "",
      translit: "",
      englishCsv: "",
      difficulty: 1,
      level: mode.defaultLevel,
    };
  }
  return {
    hebrew: mode.entry.hebrew,
    translit: mode.entry.translit,
    englishCsv: mode.entry.english.join(", "),
    difficulty: mode.entry.difficulty,
    level: mode.entry.level,
  };
}

function modeKey(mode: WordFormMode): string {
  if (mode.kind === "create") return `create:${mode.defaultLevel}`;
  if (mode.kind === "edit-custom") return `edit-custom:${mode.id}`;
  return `edit-bundled:${mode.entry.hebrew}`;
}

export function WordFormDialog(props: WordFormDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {props.open && props.mode ? (
          <WordFormBody
            // Remount the inner form for each new editing target so default
            // state is recomputed without a setState-in-effect.
            key={modeKey(props.mode)}
            mode={props.mode}
            onCancel={() => props.onOpenChange(false)}
            onSubmit={props.onSubmit}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

interface WordFormBodyProps {
  mode: WordFormMode;
  onCancel: () => void;
  onSubmit: (draft: WordDraft) => void;
}

function WordFormBody({ mode, onCancel, onSubmit }: WordFormBodyProps) {
  const [form, setForm] = useState<FormState>(() => modeToInitial(mode));
  const [error, setError] = useState<string | null>(null);

  const title =
    mode.kind === "create"
      ? "Add word"
      : mode.kind === "edit-bundled"
        ? "Edit bundled word"
        : "Edit word";

  const description =
    mode.kind === "edit-bundled"
      ? "Editing hides the bundled entry and saves a custom replacement (reset in Admin to restore)."
      : "All fields are required.";

  function handleSave() {
    const englishList = form.englishCsv
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (!form.hebrew.trim()) return setError("Hebrew word is required.");
    if (!form.translit.trim()) return setError("Transliteration is required.");
    if (englishList.length === 0)
      return setError("At least one English meaning is required.");
    if (form.level < 1 || form.level > LEVEL_COUNT)
      return setError(`Level must be between 1 and ${LEVEL_COUNT}.`);
    onSubmit({
      hebrew: form.hebrew,
      translit: form.translit,
      english: englishList,
      difficulty: form.difficulty,
      level: form.level,
    });
  }

  return (
    <>
      <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="hebrew">Hebrew (with nikud)</Label>
            <Input
              id="hebrew"
              dir="rtl"
              lang="he"
              className="font-hebrew text-lg"
              value={form.hebrew}
              onChange={(e) =>
                setForm({ ...form, hebrew: e.currentTarget.value })
              }
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="translit">Transliteration</Label>
            <Input
              id="translit"
              value={form.translit}
              onChange={(e) =>
                setForm({ ...form, translit: e.currentTarget.value })
              }
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="english">English meaning(s) — comma-separated</Label>
            <Input
              id="english"
              value={form.englishCsv}
              placeholder="e.g. peace, hello"
              onChange={(e) =>
                setForm({ ...form, englishCsv: e.currentTarget.value })
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="level">Level</Label>
              <Input
                id="level"
                type="number"
                min={1}
                max={LEVEL_COUNT}
                value={form.level}
                onChange={(e) =>
                  setForm({
                    ...form,
                    level: Number(e.currentTarget.value) || 1,
                  })
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Difficulty (points)</Label>
              <div className="flex gap-1">
                {[1, 2, 3].map((d) => (
                  <Button
                    key={d}
                    type="button"
                    size="sm"
                    variant={form.difficulty === d ? "default" : "outline"}
                    className={cn("flex-1")}
                    onClick={() =>
                      setForm({ ...form, difficulty: d as WordDifficulty })
                    }
                  >
                    {d}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          {error ? (
            <p className="text-destructive text-sm">{error}</p>
          ) : null}
        </div>
      <DialogFooter className="gap-2 sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" onClick={handleSave}>
          Save
        </Button>
      </DialogFooter>
    </>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import {
  WordFormDialog,
  type WordFormMode,
} from "@/components/word-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addCustomWord,
  deleteCustomWord,
  hideBundledWord,
  loadOverrides,
  replaceBundledWord,
  resetAllOverrides,
  subscribeOverrides,
  unhideBundledWord,
  type WordDraft,
  type WordOverrides,
} from "@/lib/word-overrides";
import { bundledWords, type WordEntry } from "@/lib/words";
import { cn } from "@/lib/utils";

const EMPTY_OVERRIDES: WordOverrides = {
  hiddenBundleHebrew: [],
  customWords: [],
};

let overridesCache: WordOverrides = EMPTY_OVERRIDES;

function pull() {
  overridesCache = loadOverrides();
}

function subscribe(onChange: () => void) {
  pull();
  return subscribeOverrides(() => {
    pull();
    onChange();
  });
}

function getSnapshot(): WordOverrides {
  if (typeof window === "undefined") return EMPTY_OVERRIDES;
  return overridesCache;
}

interface RowItem {
  key: string;
  source: "bundled" | "custom";
  customId?: string;
  entry: WordEntry;
  hiddenBundle?: boolean;
}

const SEARCH_DEBOUNCE_MS = 300;

function rowMatchesQuery(row: RowItem, q: string): boolean {
  if (!q) return true;
  const e = row.entry;
  const hay = [
    e.hebrew,
    e.translit,
    e.english.join(" "),
    String(e.level),
    String(e.difficulty),
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

export function WordAdmin() {
  const overrides = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => EMPTY_OVERRIDES,
  );
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<WordFormMode | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim().toLowerCase());
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  const hiddenSet = useMemo(
    () => new Set(overrides.hiddenBundleHebrew),
    [overrides.hiddenBundleHebrew],
  );

  const allRows = useMemo<RowItem[]>(() => {
    const bundleRows: RowItem[] = bundledWords.map((w) => ({
      key: `b:${w.hebrew}`,
      source: "bundled",
      entry: w,
      hiddenBundle: hiddenSet.has(w.hebrew),
    }));
    const customRows: RowItem[] = overrides.customWords.map((w) => ({
      key: `c:${w.id}`,
      source: "custom",
      customId: w.id,
      entry: w,
    }));
    return [...bundleRows, ...customRows].sort((a, b) => {
      const al = String(a.entry.level);
      const bl = String(b.entry.level);
      if (al !== bl) return al.localeCompare(bl, "en", { numeric: true });
      return a.entry.hebrew.localeCompare(b.entry.hebrew, "he");
    });
  }, [overrides, hiddenSet]);

  const rows = useMemo(
    () => allRows.filter((r) => rowMatchesQuery(r, debouncedSearch)),
    [allRows, debouncedSearch],
  );

  const totalActive = allRows.filter((r) => !r.hiddenBundle).length;
  const totalCustom = allRows.filter((r) => r.source === "custom").length;
  const totalHidden = allRows.filter((r) => r.hiddenBundle).length;

  function openCreate() {
    setDialogMode({ kind: "create", defaultLevel: 1 });
    setDialogOpen(true);
  }

  function openEdit(row: RowItem) {
    if (row.source === "custom" && row.customId) {
      setDialogMode({
        kind: "edit-custom",
        id: row.customId,
        entry: row.entry,
      });
    } else {
      setDialogMode({ kind: "edit-bundled", entry: row.entry });
    }
    setDialogOpen(true);
  }

  function handleSubmit(draft: WordDraft) {
    if (!dialogMode) return;
    if (dialogMode.kind === "create") {
      addCustomWord(draft);
    } else if (dialogMode.kind === "edit-custom") {
      // simple "edit" = delete + re-add to keep id stable on the original
      // (use replaceBundled-like swap)
      deleteCustomWord(dialogMode.id);
      addCustomWord(draft);
    } else {
      replaceBundledWord(dialogMode.entry.hebrew, draft);
    }
    setDialogOpen(false);
  }

  function handleDelete(row: RowItem) {
    if (row.source === "custom" && row.customId) {
      if (
        confirm(`Delete custom word "${row.entry.hebrew}"? This cannot be undone.`)
      ) {
        deleteCustomWord(row.customId);
      }
      return;
    }
    if (row.hiddenBundle) {
      unhideBundledWord(row.entry.hebrew);
    } else {
      hideBundledWord(row.entry.hebrew);
    }
  }

  function handleResetAll() {
    if (
      confirm(
        "Reset all overrides? This will remove every custom word and unhide every bundled word.",
      )
    ) {
      resetAllOverrides();
    }
  }

  return (
    <div className="bg-background min-h-dvh">
      <header className="border-b bg-card/60 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <Link
            href="/"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            ← Home
          </Link>
          <h1 className="font-heading text-base font-medium sm:text-lg">
            Word admin
          </h1>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleResetAll}
          >
            Reset overrides
          </Button>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-1.5">
                <CardTitle>All words</CardTitle>
                <CardDescription>
                  {totalActive} active · {totalCustom} custom · {totalHidden}{" "}
                  hidden bundled · {allRows.length} total rows. Bundled originals
                  can be hidden or replaced with a custom entry.
                </CardDescription>
              </div>
              <Button type="button" onClick={openCreate}>
                + Add word
              </Button>
            </div>
            <div className="grid gap-2 pt-2">
              <Label htmlFor="word-search">Search</Label>
              <Input
                id="word-search"
                type="search"
                placeholder="Hebrew, transliteration, meaning, level…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.currentTarget.value)}
                autoComplete="off"
                className="max-w-xl"
              />
              {debouncedSearch ? (
                <p className="text-muted-foreground text-xs">
                  Showing {rows.length} of {allRows.length} words
                </p>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                {allRows.length === 0 ? (
                  <>No words loaded.</>
                ) : (
                  <>
                    No matches for &quot;{debouncedSearch}&quot;. Try a
                    different search.
                  </>
                )}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[42rem] text-left text-sm">
                  <thead className="bg-muted/80">
                    <tr>
                      <th className="px-3 py-2">Lvl</th>
                      <th className="px-3 py-2">Hebrew</th>
                      <th className="px-3 py-2">Translit</th>
                      <th className="px-3 py-2">Meaning</th>
                      <th className="px-3 py-2">Diff</th>
                      <th className="px-3 py-2">Source</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.key}
                        className={cn(
                          "border-t align-top",
                          row.hiddenBundle && "opacity-50",
                        )}
                      >
                        <td className="text-muted-foreground px-3 py-2 tabular-nums">
                          {row.entry.level}
                        </td>
                        <td
                          className="font-hebrew px-3 py-2 text-xl"
                          dir="rtl"
                          lang="he"
                        >
                          {row.entry.hebrew}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {row.entry.translit}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {row.entry.english.join(", ")}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {row.entry.difficulty}
                        </td>
                        <td className="px-3 py-2">
                          {row.source === "custom" ? (
                            <Badge variant="default">custom</Badge>
                          ) : row.hiddenBundle ? (
                            <Badge variant="destructive">hidden</Badge>
                          ) : (
                            <Badge variant="secondary">bundled</Badge>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex justify-end gap-1.5">
                            {!row.hiddenBundle ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => openEdit(row)}
                              >
                                Edit
                              </Button>
                            ) : null}
                            <Button
                              type="button"
                              variant={
                                row.hiddenBundle ? "outline" : "destructive"
                              }
                              size="sm"
                              onClick={() => handleDelete(row)}
                            >
                              {row.source === "custom"
                                ? "Delete"
                                : row.hiddenBundle
                                  ? "Restore"
                                  : "Hide"}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <WordFormDialog
        open={dialogOpen}
        mode={dialogMode}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

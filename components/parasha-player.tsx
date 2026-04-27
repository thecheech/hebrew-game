"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ParashaKaraoke } from "@/components/parasha-karaoke";
import {
  ParashaLeadMode,
  type CantorScoringRef,
} from "@/components/parasha-lead-mode";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  type AliyaData,
  type ParashaIndex,
  retargetAliyaToCantor,
} from "@/lib/parasha-types";
import { cn } from "@/lib/utils";

type Cantor = NonNullable<ParashaIndex["cantors"]>[number];

/** Pick the cantor flagged `default: true`, falling back to the first
 *  entry, or null if the index doesn't list any. */
function pickDefaultCantor(cantors: Cantor[] | undefined): Cantor | null {
  if (!cantors || cantors.length === 0) return null;
  return cantors.find((c) => c.default) ?? cantors[0];
}

interface ParashaPlayerProps {
  /** URL to the index.json for this parasha. */
  indexHref: string;
}

/**
 * State model: keep the loaded aliya keyed by its URL so we never display stale
 * data after switching tabs. If `loadedAliya.href !== activeEntry.href`, the
 * UI shows "loading…" — no need to imperatively null-out state inside effects.
 */
type LoadedAliya = { href: string; data: AliyaData };

export function ParashaPlayer({ indexHref }: ParashaPlayerProps) {
  const [index, setIndex] = useState<ParashaIndex | null>(null);
  const [activeAliyaNum, setActiveAliyaNum] = useState<number | null>(null);
  const [loadedAliya, setLoadedAliya] = useState<LoadedAliya | null>(null);
  const [scrollStyle, setScrollStyle] = useState(false);
  const [showTranslit, setShowTranslit] = useState(false);
  /** The cantor whose audio is currently used. Null until index.json
   *  loads (or when the parasha lists no cantors at all — in which case the
   *  selector is hidden and the legacy aliya.audio path is used). */
  const [cantorId, setCantorId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load index.json once.
  useEffect(() => {
    const ac = new AbortController();
    fetch(indexHref, { signal: ac.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load index (${r.status})`);
        return r.json() as Promise<ParashaIndex>;
      })
      .then((data) => {
        setIndex(data);
        if (data.aliyot[0]) setActiveAliyaNum(data.aliyot[0].num);
        const def = pickDefaultCantor(data.cantors);
        if (def) setCantorId(def.id);
      })
      .catch((err: Error) => {
        if (err.name !== "AbortError") setError(err.message);
      });
    return () => ac.abort();
  }, [indexHref]);

  // Resolve the active aliya entry from the index (drives the default JSON
  // href when the active cantor doesn't bring its own).
  const activeEntry =
    index && activeAliyaNum != null
      ? (index.aliyot.find((a) => a.num === activeAliyaNum) ?? null)
      : null;

  // Resolve the active cantor and the per-aliya track override (if any).
  const cantors = index?.cantors;
  const activeCantor: Cantor | null = useMemo(() => {
    if (!cantors || cantors.length === 0) return null;
    return cantors.find((c) => c.id === cantorId) ?? pickDefaultCantor(cantors);
  }, [cantors, cantorId]);
  const cantorTrack = useMemo(() => {
    if (!activeCantor || activeAliyaNum == null) return null;
    return activeCantor.tracks?.[String(activeAliyaNum)] ?? null;
  }, [activeCantor, activeAliyaNum]);

  // The URL we actually fetch. Prefer a per-cantor pre-aligned JSON when
  // declared (`tracks[N].href`); otherwise fetch the default cantor's
  // JSON and apply the linear-scale fallback below.
  const preferredHref = cantorTrack?.href ?? activeEntry?.href ?? null;
  const fallbackHref = activeEntry?.href ?? null;

  useEffect(() => {
    if (!preferredHref) return;
    const ac = new AbortController();
    const tryLoad = async (url: string) => {
      const r = await fetch(url, { signal: ac.signal });
      if (!r.ok) throw new Error(`Failed to load aliya (${r.status})`);
      return (await r.json()) as AliyaData;
    };
    (async () => {
      try {
        const data = await tryLoad(preferredHref);
        setLoadedAliya({ href: preferredHref, data });
      } catch (err) {
        // The per-cantor JSON is optional — if it's missing (script not
        // run yet, or 404 in dev) we silently fall back to the default
        // cantor's JSON and the linear-scale path picks up the slack.
        if (
          fallbackHref &&
          fallbackHref !== preferredHref &&
          !(err instanceof DOMException && err.name === "AbortError")
        ) {
          try {
            const data = await tryLoad(fallbackHref);
            setLoadedAliya({ href: fallbackHref, data });
            return;
          } catch (err2) {
            if (
              err2 instanceof Error &&
              err2.name !== "AbortError"
            ) {
              setError(err2.message);
            }
            return;
          }
        }
        if (err instanceof Error && err.name !== "AbortError") {
          setError(err.message);
        }
      }
    })();
    return () => ac.abort();
  }, [preferredHref, fallbackHref]);

  // The loader may have settled on either the preferred or the fallback
  // href, so accept both as valid "current" data.
  const baseAliyaData =
    loadedAliya &&
    (loadedAliya.href === preferredHref || loadedAliya.href === fallbackHref)
      ? loadedAliya.data
      : null;

  // If we ended up loading a JSON whose embedded `audio` doesn't match the
  // selected cantor's track (i.e. we used the default JSON because the alt
  // cantor doesn't have a pre-aligned JSON yet), apply the linear-scale
  // fallback: swap the audio src + duration and rescale word timings.
  // When the JSON's audio already matches, this is a no-op.
  const aliyaData = useMemo(() => {
    if (!baseAliyaData) return null;
    if (!cantorTrack) return baseAliyaData;
    if (baseAliyaData.audio === cantorTrack.audio) return baseAliyaData;
    return retargetAliyaToCantor(baseAliyaData, {
      audio: cantorTrack.audio,
      duration: cantorTrack.duration,
    });
  }, [baseAliyaData, cantorTrack]);

  // Mic-based scoring is only meaningful against the cantor the
  // per-word JSON timings were aligned to. The UI now
  // exposes only "Practice with mic", but we still fall back to
  // listen mode when a selected cantor doesn't support scoring.
  const supportsScoring = activeCantor?.supportsScoring !== false;
  const effectiveMode: "listen" | "practice" =
    supportsScoring ? "practice" : "listen";

  // Build the scoring reference passed to ParashaLeadMode (and nested flows).
  // Null when there's no cantor data at all (legacy parasha without a
  // `cantors` block in index.json) — the API then falls back to its
  // hardcoded default-cantor paths.
  const cantorRef: CantorScoringRef | null =
    activeCantor && cantorTrack
      ? {
          id: activeCantor.id,
          audio: cantorTrack.audio,
          wordsJson: cantorTrack.href ?? null,
        }
      : null;

  if (error) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-destructive">
          Couldn&apos;t load: {error}
        </CardContent>
      </Card>
    );
  }
  if (!index) {
    return (
      <p className="text-muted-foreground text-center text-sm">Loading…</p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
          Parashat <span className="font-hebrew">{index.parashaHebrew}</span>{" "}
          <span className="text-muted-foreground text-2xl">
            ({index.parasha})
          </span>
        </h1>
        <p className="text-muted-foreground mx-auto max-w-xl text-sm">
          {index.dateHebrew} · {formatDate(index.date)} ·{" "}
          {index.cycle === "triennial-y3"
            ? "Triennial cycle, year 3"
            : index.cycle}
        </p>
        <div className="flex justify-center">
          <Link
            href="/"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "text-muted-foreground",
            )}
          >
            ← Back to home
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex w-full justify-stretch">
            {cantors && cantors.length > 0 ? (
              <div className="bg-muted/30 flex w-full flex-col gap-2 rounded-lg border px-2.5 py-2 sm:flex-row sm:items-center sm:gap-3 sm:py-1.5">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="text-muted-foreground shrink-0 text-xs">Cantor</span>
                  <span
                    className="min-w-0 truncate text-sm font-medium"
                    title={activeCantor?.label ?? cantors[0].label}
                  >
                    {activeCantor?.label ?? cantors[0].label}
                  </span>
                  {supportsScoring ? null : (
                    <span className="text-muted-foreground shrink-0 text-[0.65rem]">
                      · listen only
                    </span>
                  )}
                  {cantors.length > 1 ? (
                    <Dialog>
                      <DialogTrigger render={<Button size="xs" variant="outline" />}>
                        Change
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Choose cantor</DialogTitle>
                          <DialogDescription>
                            Pick which cantor to use for listening and practice.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-2">
                          {cantors.map((c) => {
                            const isActive = (activeCantor?.id ?? "") === c.id;
                            return (
                              <Button
                                key={c.id}
                                variant={isActive ? "default" : "outline"}
                                className="h-auto w-full justify-start py-2 text-left"
                                onClick={() => setCantorId(c.id)}
                                aria-pressed={isActive}
                                title={
                                  c.supportsScoring === false
                                    ? `${c.label} — listen only (this cantor isn't enabled for mic scoring)`
                                    : c.label
                                }
                              >
                                <span>{c.label}</span>
                                {c.default ? (
                                  <span className="text-muted-foreground ml-1.5 text-[0.65rem] uppercase tracking-wide">
                                    default
                                  </span>
                                ) : null}
                              </Button>
                            );
                          })}
                        </div>
                        <DialogFooter showCloseButton />
                      </DialogContent>
                    </Dialog>
                  ) : null}
                </div>

                <div
                  className="bg-border hidden shrink-0 sm:block sm:h-6 sm:w-px"
                  aria-hidden
                />

                <div
                  className="flex flex-wrap items-center gap-1.5 sm:justify-end"
                  role="group"
                  aria-label="Hebrew display"
                >
                  <div className="bg-background/60 inline-flex rounded-md border p-0.5">
                    <Button
                      size="xs"
                      variant={scrollStyle ? "ghost" : "secondary"}
                      onClick={() => setScrollStyle(false)}
                      aria-pressed={!scrollStyle}
                      className="h-7 px-2"
                      title="With vowels and cantillation marks"
                    >
                      Marks
                    </Button>
                    <Button
                      size="xs"
                      variant={scrollStyle ? "secondary" : "ghost"}
                      onClick={() => setScrollStyle(true)}
                      aria-pressed={scrollStyle}
                      className="h-7 px-2"
                      title="Torah scroll style (consonants only)"
                    >
                      Scroll
                    </Button>
                  </div>
                  <label className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground select-none">
                    <input
                      type="checkbox"
                      className="size-3.5 accent-primary cursor-pointer"
                      checked={showTranslit}
                      onChange={(e) => setShowTranslit(e.target.checked)}
                      aria-label="Transliteration"
                    />
                    Translit
                  </label>
                </div>
              </div>
            ) : null}
          </div>

          {/* Aliya tabs */}
          <div className="bg-muted/20 grid grid-cols-2 gap-2 rounded-lg border p-2 sm:grid-cols-3 lg:grid-cols-6">
            {index.aliyot.map((a) => (
              <Button
                key={a.num}
                size="sm"
                variant={a.num === activeAliyaNum ? "default" : "outline"}
                onClick={() => setActiveAliyaNum(a.num)}
                className="h-auto min-h-12 flex-col gap-0 py-1"
              >
                <span className="text-xs font-semibold">Aliya {a.num}</span>
                <span className="text-[0.65rem] opacity-80">
                  Gen {a.label.split("Genesis")[1]?.trim() ?? ""}
                </span>
              </Button>
            ))}
          </div>
        </CardHeader>
      </Card>

      <div className="min-h-[28rem]">
        {aliyaData ? (
          effectiveMode === "listen" ? (
            <ParashaKaraoke
              aliya={aliyaData}
              scrollStyle={scrollStyle}
              showTranslit={showTranslit}
            />
          ) : (
            // Key on the audio path so switching aliyas remounts the
            // practice component — that drops in-flight session state,
            // selection, and analysis results without needing a reset
            // effect (which trips react-hooks/set-state-in-effect when
            // resetting many fields at once).
            <ParashaLeadMode
              key={aliyaData.audio}
              aliya={aliyaData}
              scrollStyle={scrollStyle}
              showTranslit={showTranslit}
              cantor={cantorRef}
            />
          )
        ) : (
          <p className="text-muted-foreground text-center text-sm">
            Loading aliya {activeAliyaNum}...
          </p>
        )}
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

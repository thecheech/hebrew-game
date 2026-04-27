"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { PARASHA_LIST, BOOK_LABELS } from "@/lib/parasha-list";
import { saveProfile, type BneiMitzvahType } from "@/lib/bar-mitzvah-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const BOOKS = [
  "Genesis",
  "Exodus",
  "Leviticus",
  "Numbers",
  "Deuteronomy",
] as const;

export default function OnboardPage() {
  const router = useRouter();

  const [type, setType] = useState<BneiMitzvahType>("bar");
  const [eventDate, setEventDate] = useState("");
  const [parashaSlug, setParashaSlug] = useState("");
  const [error, setError] = useState("");

  const selectedParasha = PARASHA_LIST.find((p) => p.slug === parashaSlug);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!parashaSlug) {
      setError("Please select your Torah portion.");
      return;
    }
    if (!eventDate) {
      setError("Please enter your event date.");
      return;
    }
    if (!selectedParasha) {
      setError("Unknown parasha selected.");
      return;
    }

    saveProfile({
      type,
      parashaSlug,
      parashaId: selectedParasha.id,
      eventDate,
    });

    // Send them to login; after login they'll land on their parasha
    router.push(`/login?callbackUrl=/parasha/${parashaSlug}`);
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="space-y-2 text-center">
          <div
            className="mx-auto mb-4 font-serif text-5xl leading-none"
            dir="rtl"
            lang="he"
            aria-hidden
          >
            {selectedParasha?.hebrew ?? "טוֹב"}
          </div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
            Set up your practice
          </h1>
          <p className="text-muted-foreground text-sm">
            Tell us about your upcoming {type === "bar" ? "Bar" : "Bat"} Mitzvah
            so we can focus your practice on your portion.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Bar / Bat toggle */}
          <div className="space-y-2">
            <Label>Ceremony type</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["bar", "bat"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={cn(
                    "rounded-lg border px-4 py-3 text-sm font-medium transition-colors",
                    type === t
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-foreground hover:bg-accent/40",
                  )}
                >
                  {t === "bar" ? "Bar Mitzvah" : "Bat Mitzvah"}
                </button>
              ))}
            </div>
          </div>

          {/* Parasha select */}
          <div className="space-y-2">
            <Label htmlFor="parasha-select">Your Torah portion (Parasha)</Label>
            <select
              id="parasha-select"
              value={parashaSlug}
              onChange={(e) => {
                setParashaSlug(e.target.value);
                setError("");
              }}
              className={cn(
                "w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
                "ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                "text-foreground",
                !parashaSlug && "text-muted-foreground",
              )}
            >
              <option value="" disabled>
                Select your parasha…
              </option>
              {BOOKS.map((book) => (
                <optgroup key={book} label={BOOK_LABELS[book]}>
                  {PARASHA_LIST.filter((p) => p.book === book).map((p) => (
                    <option key={p.slug} value={p.slug}>
                      {p.id}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>

            {/* Show Hebrew name once selected */}
            {selectedParasha && (
              <p
                className="text-right font-serif text-lg text-muted-foreground"
                dir="rtl"
                lang="he"
              >
                {selectedParasha.hebrew}
              </p>
            )}
          </div>

          {/* Event date */}
          <div className="space-y-2">
            <Label htmlFor="event-date">
              {type === "bar" ? "Bar" : "Bat"} Mitzvah date
            </Label>
            <Input
              id="event-date"
              type="date"
              value={eventDate}
              onChange={(e) => {
                setEventDate(e.target.value);
                setError("");
              }}
              className="w-full"
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          {/* Submit */}
          <Button
            type="submit"
            className="w-full"
            size="lg"
            disabled={!parashaSlug || !eventDate}
          >
            Let&apos;s start practicing →
          </Button>
        </form>

        {/* Already have an account */}
        <p className="text-center text-xs text-muted-foreground">
          Already have an account?{" "}
          <a href="/login" className="underline underline-offset-2 hover:text-foreground">
            Sign in
          </a>
        </p>
      </div>
    </main>
  );
}

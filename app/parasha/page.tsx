import type { Metadata } from "next";
import Link from "next/link";
import { PARASHA_LIST, BOOK_LABELS, type ParashaEntry } from "@/lib/parasha-list";

export const metadata: Metadata = {
  title: "Torah Portions · Cantillation Practice",
  description:
    "Choose your Torah portion and practice chanting with word-by-word highlighting, reference audio, and phrase looping.",
};

const BOOKS = [
  "Genesis",
  "Exodus",
  "Leviticus",
  "Numbers",
  "Deuteronomy",
] as const;

function ParashaCard({ parasha }: { parasha: ParashaEntry }) {
  return (
    <Link
      href={`/parasha/${parasha.slug}`}
      className="group flex flex-col gap-1 rounded-xl border border-border bg-card px-4 py-3 shadow-sm transition-all hover:border-primary/50 hover:shadow-md hover:bg-accent/30"
    >
      <span className="text-xs font-medium text-muted-foreground">
        #{parasha.num}
      </span>
      <span
        className="text-right font-serif text-2xl leading-snug text-foreground"
        dir="rtl"
        lang="he"
      >
        {parasha.hebrew}
      </span>
      <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
        {parasha.id}
      </span>
    </Link>
  );
}

export default function ParashaListPage() {
  const byBook = BOOKS.map((book) => ({
    book,
    label: BOOK_LABELS[book],
    parashot: PARASHA_LIST.filter((p) => p.book === book),
  }));

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 space-y-10">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Torah Portions</h1>
        <p className="text-muted-foreground">
          Choose your parasha to practice cantillation with audio, word-by-word
          highlighting, and phrase looping.
        </p>
      </div>

      {byBook.map(({ book, label, parashot }) => (
        <section key={book} className="space-y-4">
          <h2 className="text-lg font-semibold text-muted-foreground border-b border-border pb-2">
            {label}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {parashot.map((p) => (
              <ParashaCard key={p.slug} parasha={p} />
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}

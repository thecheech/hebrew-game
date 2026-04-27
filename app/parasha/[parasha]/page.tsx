import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { ParashaPlayer } from "@/components/parasha-player";
import { findBySlug } from "@/lib/parasha-list";

interface Props {
  params: Promise<{ parasha: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { parasha: slug } = await params;
  const entry = findBySlug(slug);
  if (!entry) return { title: "Not Found" };
  return {
    title: `Parashat ${entry.id} · Cantillation Practice`,
    description: `Practice chanting Parashat ${entry.id} with reference audio, word-by-word highlighting, and phrase looping.`,
  };
}

export default async function ParashaPage({ params }: Props) {
  const { parasha: slug } = await params;
  const entry = findBySlug(slug);
  if (!entry) notFound();

  return (
    <div className="min-h-dvh flex-1">
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <Link
          href="/parasha"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          All Torah Portions
        </Link>
        <ParashaPlayer indexHref={`/parasha/${slug}/index.json`} />
      </div>
    </div>
  );
}

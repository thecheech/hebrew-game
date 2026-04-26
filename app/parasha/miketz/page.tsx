import type { Metadata } from "next";

import { ParashaPlayer } from "@/components/parasha-player";

export const metadata: Metadata = {
  title: "Parashat Miketz · cantillation practice",
  description:
    "Practice chanting Parashat Miketz aliya 1 (Gen 43:16–18) and aliya 7 (Gen 44:11–17) with reference audio, word-by-word highlighting, and phrase looping.",
};

export default function MiketzPage() {
  return (
    <div className="min-h-dvh flex-1">
      <div className="mx-auto max-w-4xl space-y-8 px-4 py-10">
        <ParashaPlayer indexHref="/parasha/miketz/index.json" />
      </div>
    </div>
  );
}

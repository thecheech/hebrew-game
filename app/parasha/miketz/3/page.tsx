import type { Metadata } from "next";

import { ParashaPlayer } from "@/components/parasha-player";

export const metadata: Metadata = {
  title: "Parashat Miketz · cantillation practice",
  description:
    "Practice chanting Parashat Miketz (triennial cycle, year 3) with reference audio, word-by-word highlighting, and phrase looping.",
};

export default function MiketzYear3Page() {
  return (
    <div className="min-h-dvh flex-1">
      <div className="mx-auto max-w-4xl space-y-8 px-4 py-10">
        <ParashaPlayer indexHref="/parasha/miketz/3/index.json" />
      </div>
    </div>
  );
}

export type BneiMitzvahType = "bar" | "bat";

export interface BarMitzvahProfile {
  type: BneiMitzvahType;
  parashaSlug: string;
  parashaId: string;
  eventDate: string; // ISO date string "YYYY-MM-DD"
}

const PROFILE_KEY = "bar-mitzvah-profile";

export function saveProfile(profile: BarMitzvahProfile): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function loadProfile(): BarMitzvahProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as BarMitzvahProfile) : null;
  } catch {
    return null;
  }
}

export function clearProfile(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(PROFILE_KEY);
}

/** Format event date for display, e.g. "Shabbat, June 14, 2025" */
export function formatEventDate(isoDate: string): string {
  const d = new Date(isoDate + "T12:00:00"); // noon UTC to avoid timezone flipping
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Days until the event (positive = future, negative = past) */
export function daysUntilEvent(isoDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const event = new Date(isoDate + "T00:00:00");
  return Math.round((event.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Forward an /api/parasha/analyze* call to the external Python service.
 *
 * The shape of `params` mirrors what the Vercel routes already collect
 * from the incoming `FormData`. We rebuild the multipart payload here so
 * we can:
 *   1. Swap `cantorAudio` (path on this deployment) for `cantorAudioUrl`
 *      (full https URL) — the service downloads + caches by URL.
 *   2. Default the cantor audio to the per-aliya stock asset when the
 *      caller didn't pass one (the "no cantors block in index.json"
 *      legacy path).
 *   3. Attach the bearer token from `PARASHA_ANALYZE_TOKEN` once, so each
 *      route doesn't have to reimplement it.
 *
 * Returns the upstream Response so the calling route can pass through the
 * status code and JSON body unchanged.
 */

import { defaultParashaRefAudioPublicPath } from "@/lib/parasha-exec-assets";

export type RemoteAnalyzeMode = "aliya" | "word";

export interface RemoteAnalyzeParams {
  mode: RemoteAnalyzeMode;
  /** Origin of the current Next.js deployment, e.g. `https://hebrew-game-eight.vercel.app`. */
  origin: string;
  studentBlob: Blob;
  aliyaNum: string;
  parasha: string;
  cantorId?: string | null;
  /** Path or full URL of the cantor reference audio (any leading `/`). */
  cantorAudio?: string | null;
  /** Path or full URL of the cantor pre-aligned words JSON. */
  cantorWordsJson?: string | null;
  // Aliya-mode segment scoping:
  segStart?: number | null;
  segEnd?: number | null;
  wordStart?: number | null;
  wordEnd?: number | null;
  // Word-mode index:
  wordIdx?: number | null;
}

/**
 * `true` when the env vars needed to forward to the external service
 * are present. Routes branch on this to pick remote vs. local subprocess.
 */
export function isRemoteAnalyzeConfigured(): boolean {
  return !!process.env.PARASHA_ANALYZE_URL?.trim();
}

/** Resolve a possibly-relative public path against the deployment origin. */
function toAbsoluteUrl(origin: string, raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return new URL(path, origin).toString();
}

export async function forwardAnalyzeToRemote(
  params: RemoteAnalyzeParams,
): Promise<Response> {
  const base = process.env.PARASHA_ANALYZE_URL?.trim();
  if (!base) {
    // Caller should have checked isRemoteAnalyzeConfigured() first; this
    // is a programmer error, not a runtime failure mode the user can hit.
    throw new Error("PARASHA_ANALYZE_URL is not configured");
  }
  const token = process.env.PARASHA_ANALYZE_TOKEN?.trim();

  const endpoint =
    params.mode === "word" ? "/analyze-word" : "/analyze";
  const url = new URL(endpoint, base.endsWith("/") ? base : `${base}/`);

  // Default to the stock per-aliya audio when the caller didn't pin a
  // cantor. Mirrors what `defaultParashaRefAudioPublicPath` does in the
  // existing routes.
  const cantorAudioPath =
    params.cantorAudio?.trim() ||
    defaultParashaRefAudioPublicPath(params.parasha, params.aliyaNum);
  const cantorAudioUrl = toAbsoluteUrl(params.origin, cantorAudioPath);
  if (!cantorAudioUrl) {
    // Should be impossible — defaultParashaRefAudioPublicPath always returns
    // a leading-slash path — but keep the guard so a future bug doesn't
    // silently send `null` to the service.
    throw new Error("could not resolve cantor audio URL");
  }

  const cantorWordsJsonUrl = toAbsoluteUrl(
    params.origin,
    params.cantorWordsJson ?? null,
  );

  const fd = new FormData();
  fd.append("student", params.studentBlob, "student.wav");
  fd.append("aliyaNum", params.aliyaNum);
  fd.append("parasha", params.parasha);
  if (params.cantorId) fd.append("cantorId", params.cantorId);
  fd.append("cantorAudioUrl", cantorAudioUrl);
  if (cantorWordsJsonUrl) fd.append("cantorWordsJsonUrl", cantorWordsJsonUrl);

  if (params.mode === "word") {
    if (params.wordIdx == null) {
      throw new Error("wordIdx is required in word mode");
    }
    fd.append("wordIdx", String(params.wordIdx));
  } else {
    if (
      params.segStart != null &&
      params.segEnd != null &&
      Number.isFinite(params.segStart) &&
      Number.isFinite(params.segEnd) &&
      params.segEnd > params.segStart
    ) {
      fd.append("segStart", String(params.segStart));
      fd.append("segEnd", String(params.segEnd));
      if (
        params.wordStart != null &&
        params.wordEnd != null &&
        Number.isInteger(params.wordStart) &&
        Number.isInteger(params.wordEnd) &&
        params.wordStart >= 0 &&
        params.wordEnd >= params.wordStart
      ) {
        fd.append("wordStart", String(params.wordStart));
        fd.append("wordEnd", String(params.wordEnd));
      }
    }
  }

  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;

  return fetch(url, {
    method: "POST",
    body: fd,
    headers,
  });
}

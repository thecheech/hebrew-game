import fs from "fs/promises";
import path from "path";
import os from "os";

/**
 * Map a browser-facing path like `/parasha/miketz/audio/aliya1.mp3` to an
 * absolute path under `public/`, or null if it escapes `public/`.
 */
export function resolvePublicUrlToFsPath(url: string | null): string | null {
  if (!url || typeof url !== "string") return null;
  if (!url.startsWith("/")) return null;
  const publicRoot = path.resolve(process.cwd(), "public");
  const fsPath = path.resolve(publicRoot, url.replace(/^\/+/, ""));
  if (!fsPath.startsWith(publicRoot + path.sep) && fsPath !== publicRoot) {
    return null;
  }
  return fsPath;
}

/**
 * Returns a local filesystem path suitable for `execFile` (Python). Uses the
 * file under `public/` when present (local dev). When missing — e.g. Vercel
 * after `outputFileTracingExcludes` — fetches the same path from `origin`.
 */
export async function materializePublicAssetForExec(
  origin: string,
  publicUrlPath: string,
): Promise<{ localPath: string; dispose: () => Promise<void> }> {
  const normalized = publicUrlPath.startsWith("/")
    ? publicUrlPath
    : `/${publicUrlPath}`;
  const fsPath = resolvePublicUrlToFsPath(normalized);
  if (!fsPath) {
    throw new Error("Invalid public asset path");
  }
  try {
    await fs.stat(fsPath);
    return { localPath: fsPath, dispose: async () => {} };
  } catch {
    const res = await fetch(new URL(normalized, origin));
    if (!res.ok) {
      throw new Error(
        `Could not load asset ${normalized}: HTTP ${res.status}`,
      );
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const suffix = path.extname(normalized) || ".bin";
    const tmp = path.join(
      os.tmpdir(),
      `parasha-exec-${Date.now()}-${Math.random().toString(36).slice(2)}${suffix}`,
    );
    await fs.writeFile(tmp, buf);
    return {
      localPath: tmp,
      dispose: async () => {
        await fs.unlink(tmp).catch(() => {});
      },
    };
  }
}

export function defaultParashaRefAudioPublicPath(
  parasha: string,
  aliyaNum: string,
): string {
  return `/parasha/${parasha.toLowerCase()}/audio/aliya${aliyaNum}.mp3`;
}

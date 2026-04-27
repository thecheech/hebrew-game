import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";

import { resolveParashaAnalyzePython } from "@/lib/parasha-analyze-python";

const execFileAsync = promisify(execFile);

// Vercel hobby limit is 60s; pro is higher. Locally we control the
// timeout passed to execFile below. The first request for a given
// (parasha, aliya) builds the reference F0 cache (slow); later requests
// are fast.
export const maxDuration = 60;

/**
 * Resolve a public URL like `/parasha/miketz/audio/alt/aliya1.mp3` to
 * its filesystem path under public/, refusing anything that escapes
 * public/ via `..` or absolute paths. Returns null on a malformed URL
 * so the caller can fall through to a default rather than 500.
 *
 * The path-traversal guard matters: this URL comes from a form field
 * the browser controls. Without the guard a request could pass
 * `cantorAudio=/../../etc/passwd` and we'd hand that to execFile.
 */
function resolvePublicUrl(url: string | null): string | null {
  if (!url || typeof url !== "string") return null;
  if (!url.startsWith("/")) return null;
  const publicRoot = path.resolve(process.cwd(), "public");
  // Strip the leading slash so path.resolve treats the URL as a
  // relative segment under public/, not an absolute filesystem path.
  const fsPath = path.resolve(publicRoot, url.replace(/^\/+/, ""));
  if (!fsPath.startsWith(publicRoot + path.sep) && fsPath !== publicRoot) {
    return null;
  }
  return fsPath;
}

/**
 * Sanitize a cantor id to a safe cache-key suffix. Cache files live on
 * disk as `<key>_sr16000_hop512_v3.npz`, so we keep this to letters,
 * digits, dashes, and underscores. Empty or unsafe input → null.
 */
function sanitizeCantorId(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  return cleaned.length === 0 ? null : cleaned.slice(0, 64);
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const studentBlob = formData.get("student") as Blob | null;
    const aliyaNum = formData.get("aliyaNum") as string;
    const parasha = formData.get("parasha") as string;
    // Optional segment scoping. When present, the student practice
    // covers only the cantor's [segStart, segEnd] window and the python
    // script will (a) filter words to those boundaries, (b) shift student
    // frame times by +segStart so they line up with cantor-space word
    // boundaries, and (c) report aliya-level rollups over just the
    // segment. wordStart/wordEnd are inclusive flat-word indices, used as
    // a redundant sanity check on the time window.
    const segStartRaw = formData.get("segStart");
    const segEndRaw = formData.get("segEnd");
    const wordStartRaw = formData.get("wordStart");
    const wordEndRaw = formData.get("wordEnd");
    // Optional cantor overrides. When the student is scoring against a
    // non-default cantor, the frontend sends:
    //   cantorAudio       — public URL of the alt cantor's MP3 (used as
    //                       the reference instead of the default-cantor mp3)
    //   cantorWordsJson   — public URL of the alt cantor's per-aliya JSON
    //                       (alt-time word boundaries from align_cantor.py)
    //   cantorId          — short stable id for cache isolation. Different
    //                       cantors must use distinct cache keys or the
    //                       on-disk F0/MFCC caches thrash.
    // All three are validated against the public/ directory below to
    // prevent the obvious path-traversal footgun (a request that asks us
    // to use /etc/passwd as the reference audio).
    const cantorAudioRaw = formData.get("cantorAudio");
    const cantorWordsJsonRaw = formData.get("cantorWordsJson");
    const cantorIdRaw = formData.get("cantorId");

    if (!studentBlob) {
      return NextResponse.json(
        { status: "error", error: "Missing student audio" },
        { status: 400 }
      );
    }

    if (!aliyaNum || !parasha) {
      return NextResponse.json(
        { status: "error", error: "Missing aliyaNum or parasha" },
        { status: 400 }
      );
    }

    // Convert blob to buffer and save to temp file
    const tempDir = os.tmpdir();
    const timestamp = Date.now();
    const studentPath = path.join(tempDir, `student_${timestamp}.wav`);

    const buffer = Buffer.from(await studentBlob.arrayBuffer());
    await fs.writeFile(studentPath, buffer);

    // Reference audio path. Defaults to the default cantor's mp3, but if
    // the request supplies `cantorAudio` (and it resolves cleanly under
    // public/), we score against that cantor instead. Same for the words
    // JSON.
    const defaultRefPath = path.join(
      process.cwd(),
      `public/parasha/${parasha.toLowerCase()}/audio/aliya${aliyaNum}.mp3`
    );
    const cantorRefPath =
      typeof cantorAudioRaw === "string"
        ? resolvePublicUrl(cantorAudioRaw)
        : null;
    const refPath = cantorRefPath ?? defaultRefPath;

    // Check if reference exists
    const refExists = await fs
      .stat(refPath)
      .then(() => true)
      .catch(() => false);

    if (!refExists) {
      await fs.unlink(studentPath);
      return NextResponse.json(
        {
          status: "error",
          error: `Reference audio not found: ${refPath}`,
        },
        { status: 404 }
      );
    }

    // Optional alt-cantor word-boundaries JSON. When present, the script
    // uses these instead of the default-cantor JSON. We tolerate a
    // missing file here (drop the override and let the script fall back
    // to the default JSON) — a 404 on the alignment file shouldn't
    // disable scoring entirely; it just means the scores will be
    // computed against the default-cantor word boundaries scaled
    // implicitly via DTW-less duration mapping.
    const cantorWordsJsonPath =
      typeof cantorWordsJsonRaw === "string"
        ? resolvePublicUrl(cantorWordsJsonRaw)
        : null;
    const cantorWordsJsonExists = cantorWordsJsonPath
      ? await fs
          .stat(cantorWordsJsonPath)
          .then(() => true)
          .catch(() => false)
      : false;

    const cantorId = sanitizeCantorId(cantorIdRaw);

    // Path to Python analysis script
    const scriptPath = path.join(process.cwd(), "scripts/analyze_audio.py");

    // Check if script exists
    const scriptExists = await fs
      .stat(scriptPath)
      .then(() => true)
      .catch(() => false);

    if (!scriptExists) {
      await fs.unlink(studentPath);
      return NextResponse.json(
        {
          status: "error",
          error: `Analysis script not found: ${scriptPath}`,
        },
        { status: 500 }
      );
    }

    const pythonBin = resolveParashaAnalyzePython();

    // Build the python invocation. Segment fields are optional; only
    // append them if all of segStart and segEnd are valid finite numbers
    // (wordStart/wordEnd ride along when present so the analyzer can
    // double-check). Mismatched halves get ignored rather than failing
    // the request — the worst case is "scored the whole aliya."
    const args: string[] = [scriptPath, studentPath, refPath, aliyaNum, parasha];
    // When scoring against an alt cantor, point the analyzer at the
    // cantor's per-aliya JSON (if it exists) and give it a unique cache
    // key so the on-disk F0/MFCC caches don't collide with the default
    // cantor. Skipping the words-json override when the file isn't
    // there yet lets the script fall back to the default-cantor
    // boundaries — better than failing the request outright.
    if (cantorWordsJsonExists && cantorWordsJsonPath) {
      args.push("--words-json", cantorWordsJsonPath);
    }
    if (cantorId && cantorRefPath) {
      args.push(
        "--ref-cache-key",
        `${parasha.toLowerCase()}_aliya${aliyaNum}_${cantorId}`,
      );
    }
    const segStart =
      typeof segStartRaw === "string" ? Number(segStartRaw) : NaN;
    const segEnd = typeof segEndRaw === "string" ? Number(segEndRaw) : NaN;
    if (
      Number.isFinite(segStart) &&
      Number.isFinite(segEnd) &&
      segEnd > segStart
    ) {
      args.push("--seg-start", String(segStart));
      args.push("--seg-end", String(segEnd));
      const wordStart =
        typeof wordStartRaw === "string" ? Number(wordStartRaw) : NaN;
      const wordEnd =
        typeof wordEndRaw === "string" ? Number(wordEndRaw) : NaN;
      if (
        Number.isInteger(wordStart) &&
        Number.isInteger(wordEnd) &&
        wordStart >= 0 &&
        wordEnd >= wordStart
      ) {
        args.push("--word-start", String(wordStart));
        args.push("--word-end", String(wordEnd));
      }
    }

    // Run Python analysis
    let stdout = "";
    try {
      const result = await execFileAsync(
        pythonBin,
        args,
        {
          // First call for a given (parasha, aliya) builds the reference
          // F0 cache via librosa.pyin on the full cantor track, which
          // can take 30-60s on a multi-minute aliya. Subsequent calls are
          // fast (just the student). Give it room.
          timeout: 90000,
          maxBuffer: 10 * 1024 * 1024, // 10MB max output
        }
      );
      if (result.stderr) {
        // Surface analyzer warnings (cache write/read issues, etc.) to the
        // dev server log without failing the request.
        console.warn("analyze_audio.py stderr:", result.stderr);
      }
      stdout = result.stdout;
    } catch (execError) {
      const error = execError as Error & { stderr?: string };
      console.error("Python execution error:", error.message);
      if (error.stderr) {
        console.error("stderr:", error.stderr);
      }

      // Clean up before returning error
      try {
        await fs.unlink(studentPath);
      } catch (e) {
        // ignore cleanup errors
      }

      // Try to parse error from stderr if it exists
      let errorMsg = "Audio analysis failed";
      if (error.stderr && error.stderr.includes("{")) {
        try {
          const errorJson = JSON.parse(error.stderr);
          errorMsg = errorJson.error || errorMsg;
        } catch (e) {
          // ignore JSON parse errors
        }
      }

      return NextResponse.json(
        {
          status: "error",
          error: errorMsg,
        },
        { status: 500 }
      );
    }

    // Parse results
    let results;
    try {
      results = JSON.parse(stdout);
    } catch (e) {
      console.error("JSON parse error:", e);
      console.error("stdout was:", stdout);

      await fs.unlink(studentPath);
      return NextResponse.json(
        {
          status: "error",
          error: "Failed to parse analysis results",
        },
        { status: 500 }
      );
    }

    // Clean up temp file
    try {
      await fs.unlink(studentPath);
    } catch (e) {
      console.warn("Failed to clean up temp file:", studentPath);
    }

    // Return results
    return NextResponse.json(results);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("API error:", message, error);

    return NextResponse.json(
      {
        status: "error",
        error: message,
      },
      { status: 500 }
    );
  }
}

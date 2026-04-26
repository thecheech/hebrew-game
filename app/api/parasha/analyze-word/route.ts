import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";

const execFileAsync = promisify(execFile);

// Single-word scoring is much cheaper than full-aliya — the reference F0 is
// already cached, the student blob is short (a few seconds), and pyin is
// only run on the student. 30s is plenty.
export const maxDuration = 30;

/** See app/api/parasha/analyze/route.ts for the full rationale. */
function resolvePublicUrl(url: string | null): string | null {
  if (!url || typeof url !== "string") return null;
  if (!url.startsWith("/")) return null;
  const publicRoot = path.resolve(process.cwd(), "public");
  const fsPath = path.resolve(publicRoot, url.replace(/^\/+/, ""));
  if (!fsPath.startsWith(publicRoot + path.sep) && fsPath !== publicRoot) {
    return null;
  }
  return fsPath;
}

function sanitizeCantorId(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  return cleaned.length === 0 ? null : cleaned.slice(0, 64);
}

/**
 * POST /api/parasha/analyze-word
 *
 * Multipart form fields:
 *   student   - audio Blob (single-word recording, typically <5s)
 *   parasha   - parasha name (e.g. "Miketz")
 *   aliyaNum  - aliya number (1-7)
 *   wordIdx   - word index in the aliya's flat-words array
 *
 * Returns the same shape as analyze_audio.py's word-mode output: a single
 * word_score, both speakers' tonics, and resampled F0 contours for the
 * frontend's pitch overlay.
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const studentBlob = formData.get("student") as Blob | null;
    const aliyaNum = formData.get("aliyaNum") as string;
    const parasha = formData.get("parasha") as string;
    const wordIdxRaw = formData.get("wordIdx") as string;
    // Optional cantor overrides — see analyze/route.ts for full notes.
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

    const wordIdx = Number.parseInt(wordIdxRaw ?? "", 10);
    if (!Number.isInteger(wordIdx) || wordIdx < 0) {
      return NextResponse.json(
        { status: "error", error: "Missing or invalid wordIdx" },
        { status: 400 }
      );
    }

    // Save student audio to temp file
    const tempDir = os.tmpdir();
    const timestamp = Date.now();
    const studentPath = path.join(
      tempDir,
      `word_student_${timestamp}_${wordIdx}.wav`
    );
    const buffer = Buffer.from(await studentBlob.arrayBuffer());
    await fs.writeFile(studentPath, buffer);

    // Reference audio path. Defaults to the default cantor; overridden by
    // `cantorAudio` (if it resolves cleanly under public/) when scoring
    // against an alt cantor.
    const defaultRefPath = path.join(
      process.cwd(),
      `public/parasha/${parasha.toLowerCase()}/audio/aliya${aliyaNum}.mp3`
    );
    const cantorRefPath =
      typeof cantorAudioRaw === "string"
        ? resolvePublicUrl(cantorAudioRaw)
        : null;
    const refPath = cantorRefPath ?? defaultRefPath;

    const refExists = await fs
      .stat(refPath)
      .then(() => true)
      .catch(() => false);
    if (!refExists) {
      await fs.unlink(studentPath).catch(() => {});
      return NextResponse.json(
        {
          status: "error",
          error: `Reference audio not found: ${refPath}`,
        },
        { status: 404 }
      );
    }

    // Optional alt-cantor word-boundaries JSON. Tolerate missing — script
    // falls back to default-cantor boundaries when the override is absent.
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

    const scriptPath = path.join(process.cwd(), "scripts/analyze_audio.py");
    const scriptExists = await fs
      .stat(scriptPath)
      .then(() => true)
      .catch(() => false);
    if (!scriptExists) {
      await fs.unlink(studentPath).catch(() => {});
      return NextResponse.json(
        {
          status: "error",
          error: `Analysis script not found: ${scriptPath}`,
        },
        { status: 500 }
      );
    }

    // Prefer project-local venv python; fall back to system python3.
    const venvPython = path.join(process.cwd(), "scripts/.venv/bin/python");
    const pythonBin = (await fs
      .stat(venvPython)
      .then(() => true)
      .catch(() => false))
      ? venvPython
      : "python3";

    const childArgs: string[] = [
      scriptPath,
      studentPath,
      refPath,
      aliyaNum,
      parasha,
      "--word",
      String(wordIdx),
    ];
    if (cantorWordsJsonExists && cantorWordsJsonPath) {
      childArgs.push("--words-json", cantorWordsJsonPath);
    }
    if (cantorId && cantorRefPath) {
      childArgs.push(
        "--ref-cache-key",
        `${parasha.toLowerCase()}_aliya${aliyaNum}_${cantorId}`,
      );
    }

    let stdout = "";
    try {
      const result = await execFileAsync(
        pythonBin,
        childArgs,
        {
          // Word mode is fast on cache hit (<5s typical). The first call for
          // this aliya could still need to build the reference cache, so
          // give it the same headroom as the aliya endpoint.
          timeout: 90000,
          maxBuffer: 10 * 1024 * 1024,
        }
      );
      if (result.stderr) {
        console.warn("analyze_audio.py (word) stderr:", result.stderr);
      }
      stdout = result.stdout;
    } catch (execError) {
      const error = execError as Error & { stderr?: string };
      console.error("Python execution error (word):", error.message);
      if (error.stderr) console.error("stderr:", error.stderr);

      await fs.unlink(studentPath).catch(() => {});

      let errorMsg = "Audio analysis failed";
      if (error.stderr && error.stderr.includes("{")) {
        try {
          const errorJson = JSON.parse(error.stderr);
          errorMsg = errorJson.error || errorMsg;
        } catch {
          // ignore
        }
      }

      return NextResponse.json(
        { status: "error", error: errorMsg },
        { status: 500 }
      );
    }

    let results;
    try {
      results = JSON.parse(stdout);
    } catch (e) {
      console.error("JSON parse error (word):", e);
      console.error("stdout was:", stdout);
      await fs.unlink(studentPath).catch(() => {});
      return NextResponse.json(
        { status: "error", error: "Failed to parse analysis results" },
        { status: 500 }
      );
    }

    await fs.unlink(studentPath).catch(() => {});
    return NextResponse.json(results);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("API error (analyze-word):", message, error);
    return NextResponse.json(
      { status: "error", error: message },
      { status: 500 }
    );
  }
}

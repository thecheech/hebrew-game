import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";

import { resolveParashaAnalyzePython } from "@/lib/parasha-analyze-python";
import {
  defaultParashaRefAudioPublicPath,
  materializePublicAssetForExec,
  resolvePublicUrlToFsPath,
} from "@/lib/parasha-exec-assets";
import {
  forwardAnalyzeToRemote,
  isRemoteAnalyzeConfigured,
} from "@/lib/parasha-analyze-remote";

const execFileAsync = promisify(execFile);

// Vercel hobby limit is 60s; pro is higher. Locally we control the
// timeout passed to execFile below. The first request for a given
// (parasha, aliya) builds the reference F0 cache (slow); later requests
// are fast.
export const maxDuration = 60;

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

function refAudioPublicPath(
  cantorAudioRaw: FormDataEntryValue | null,
  parasha: string,
  aliyaNum: string,
): string {
  if (
    typeof cantorAudioRaw === "string" &&
    resolvePublicUrlToFsPath(cantorAudioRaw) !== null
  ) {
    return `/${cantorAudioRaw.replace(/^\/+/, "")}`;
  }
  return defaultParashaRefAudioPublicPath(parasha, aliyaNum);
}

/**
 * Forward to the external Python service.
 *
 * On Vercel (and any Node-only host that can't run librosa), this is the
 * production path: parse the multipart, hand it to the FastAPI service,
 * pass through its JSON + status code unchanged.
 */
async function handleRemote(req: NextRequest): Promise<NextResponse> {
  const formData = await req.formData();
  const studentBlob = formData.get("student") as Blob | null;
  const aliyaNum = formData.get("aliyaNum") as string;
  const parasha = formData.get("parasha") as string;
  const segStartRaw = formData.get("segStart");
  const segEndRaw = formData.get("segEnd");
  const wordStartRaw = formData.get("wordStart");
  const wordEndRaw = formData.get("wordEnd");
  const cantorAudioRaw = formData.get("cantorAudio");
  const cantorWordsJsonRaw = formData.get("cantorWordsJson");
  const cantorIdRaw = formData.get("cantorId");

  if (!studentBlob) {
    return NextResponse.json(
      { status: "error", error: "Missing student audio" },
      { status: 400 },
    );
  }
  if (!aliyaNum || !parasha) {
    return NextResponse.json(
      { status: "error", error: "Missing aliyaNum or parasha" },
      { status: 400 },
    );
  }

  const segStart =
    typeof segStartRaw === "string" ? Number(segStartRaw) : null;
  const segEnd = typeof segEndRaw === "string" ? Number(segEndRaw) : null;
  const wordStart =
    typeof wordStartRaw === "string" ? Number.parseInt(wordStartRaw, 10) : null;
  const wordEnd =
    typeof wordEndRaw === "string" ? Number.parseInt(wordEndRaw, 10) : null;

  try {
    const upstream = await forwardAnalyzeToRemote({
      mode: "aliya",
      origin: req.nextUrl.origin,
      studentBlob,
      aliyaNum,
      parasha,
      cantorId:
        typeof cantorIdRaw === "string" ? sanitizeCantorId(cantorIdRaw) : null,
      cantorAudio:
        typeof cantorAudioRaw === "string" ? cantorAudioRaw : null,
      cantorWordsJson:
        typeof cantorWordsJsonRaw === "string" ? cantorWordsJsonRaw : null,
      segStart,
      segEnd,
      wordStart,
      wordEnd,
    });

    // Pass through both the body and the status code; the service already
    // shapes errors as `{status:"error", error:"..."}` so the frontend
    // doesn't need to know we forwarded.
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        "content-type":
          upstream.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Analysis service unreachable";
    console.error("analyze: remote forward failed:", message, error);
    return NextResponse.json(
      {
        status: "error",
        error: `Analysis service unreachable: ${message}`,
      },
      { status: 502 },
    );
  }
}

/**
 * Local-subprocess execution path (dev). Kept untouched from the
 * pre-remote-service implementation so `npm run dev` against a local
 * Python venv keeps working as before.
 */
async function handleLocal(req: NextRequest): Promise<NextResponse> {
  const origin = req.nextUrl.origin;
  let studentPath: string | null = null;
  let disposeRef: (() => Promise<void>) | null = null;
  let disposeWords: (() => Promise<void>) | null = null;

  try {
    const formData = await req.formData();
    const studentBlob = formData.get("student") as Blob | null;
    const aliyaNum = formData.get("aliyaNum") as string;
    const parasha = formData.get("parasha") as string;
    const segStartRaw = formData.get("segStart");
    const segEndRaw = formData.get("segEnd");
    const wordStartRaw = formData.get("wordStart");
    const wordEndRaw = formData.get("wordEnd");
    const cantorAudioRaw = formData.get("cantorAudio");
    const cantorWordsJsonRaw = formData.get("cantorWordsJson");
    const cantorIdRaw = formData.get("cantorId");

    if (!studentBlob) {
      return NextResponse.json(
        { status: "error", error: "Missing student audio" },
        { status: 400 },
      );
    }

    if (!aliyaNum || !parasha) {
      return NextResponse.json(
        { status: "error", error: "Missing aliyaNum or parasha" },
        { status: 400 },
      );
    }

    const tempDir = os.tmpdir();
    const timestamp = Date.now();
    studentPath = path.join(tempDir, `student_${timestamp}.wav`);

    const buffer = Buffer.from(await studentBlob.arrayBuffer());
    await fs.writeFile(studentPath, buffer);

    const refPublicUrl = refAudioPublicPath(cantorAudioRaw, parasha, aliyaNum);
    let refLocalPath: string;
    try {
      const refM = await materializePublicAssetForExec(origin, refPublicUrl);
      refLocalPath = refM.localPath;
      disposeRef = refM.dispose;
    } catch {
      if (studentPath) await fs.unlink(studentPath).catch(() => {});
      return NextResponse.json(
        {
          status: "error",
          error: `Reference audio not found: ${refPublicUrl}`,
        },
        { status: 404 },
      );
    }

    let wordsLocalPath: string | null = null;
    if (
      typeof cantorWordsJsonRaw === "string" &&
      resolvePublicUrlToFsPath(cantorWordsJsonRaw) !== null
    ) {
      const wordsPublicUrl = `/${cantorWordsJsonRaw.replace(/^\/+/, "")}`;
      try {
        const w = await materializePublicAssetForExec(origin, wordsPublicUrl);
        wordsLocalPath = w.localPath;
        disposeWords = w.dispose;
      } catch {
        wordsLocalPath = null;
        disposeWords = null;
      }
    }

    const cantorId = sanitizeCantorId(cantorIdRaw);

    const scriptPath = path.join(process.cwd(), "scripts/analyze_audio.py");

    const scriptExists = await fs
      .stat(scriptPath)
      .then(() => true)
      .catch(() => false);

    if (!scriptExists) {
      if (studentPath) await fs.unlink(studentPath).catch(() => {});
      if (disposeRef) await disposeRef();
      if (disposeWords) await disposeWords();
      disposeRef = null;
      disposeWords = null;
      return NextResponse.json(
        {
          status: "error",
          error: `Analysis script not found: ${scriptPath}`,
        },
        { status: 500 },
      );
    }

    const pythonBin = resolveParashaAnalyzePython();

    const args: string[] = [
      scriptPath,
      studentPath,
      refLocalPath,
      aliyaNum,
      parasha,
    ];
    if (wordsLocalPath) {
      args.push("--words-json", wordsLocalPath);
    }
    const cantorRefValid =
      typeof cantorAudioRaw === "string" &&
      resolvePublicUrlToFsPath(cantorAudioRaw) !== null;
    if (cantorId && cantorRefValid) {
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

    let stdout = "";
    try {
      const result = await execFileAsync(pythonBin, args, {
        timeout: 90000,
        maxBuffer: 10 * 1024 * 1024,
      });
      if (result.stderr) {
        console.warn("analyze_audio.py stderr:", result.stderr);
      }
      stdout = result.stdout;
    } catch (execError) {
      const error = execError as Error & { stderr?: string; code?: string };
      console.error("Python execution error:", error.message);
      if (error.stderr) {
        console.error("stderr:", error.stderr);
      }

      // ENOENT means `python3` (or the binary in PARASHA_ANALYZE_PYTHON)
      // doesn't exist on this runtime. Surface the configuration miss
      // explicitly instead of pretending it's an analysis failure — this
      // is exactly the case where someone deployed without setting
      // `PARASHA_ANALYZE_URL`.
      if (error.code === "ENOENT") {
        console.error(
          "analyze: python binary missing AND PARASHA_ANALYZE_URL is unset.",
          "Deploy the service in service/ and set PARASHA_ANALYZE_URL on this project.",
        );
        return NextResponse.json(
          {
            status: "error",
            error:
              "Practice scoring isn't available right now. Please try again later.",
          },
          { status: 503 },
        );
      }

      let errorMsg = "Audio analysis failed";
      if (error.stderr && error.stderr.includes("{")) {
        try {
          const errorJson = JSON.parse(error.stderr);
          errorMsg = errorJson.error || errorMsg;
        } catch {
          // ignore JSON parse errors
        }
      }

      return NextResponse.json(
        { status: "error", error: errorMsg },
        { status: 500 },
      );
    }

    let results: unknown;
    try {
      results = JSON.parse(stdout);
    } catch (e) {
      console.error("JSON parse error:", e);
      console.error("stdout was:", stdout);
      return NextResponse.json(
        { status: "error", error: "Failed to parse analysis results" },
        { status: 500 },
      );
    }

    return NextResponse.json(results);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("API error:", message, error);

    return NextResponse.json(
      { status: "error", error: message },
      { status: 500 },
    );
  } finally {
    if (studentPath) {
      await fs.unlink(studentPath).catch(() => {});
    }
    if (disposeRef) {
      await disposeRef().catch(() => {});
    }
    if (disposeWords) {
      await disposeWords().catch(() => {});
    }
  }
}

export async function POST(req: NextRequest) {
  if (isRemoteAnalyzeConfigured()) {
    return handleRemote(req);
  }
  return handleLocal(req);
}

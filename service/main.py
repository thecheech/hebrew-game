"""
HTTP wrapper around `scripts/analyze_audio.py`.

Why this exists
---------------
The Vercel Node serverless runtime that hosts /api/parasha/analyze can't
spawn `python3` and doesn't ship librosa/scipy/numpy. We move the Python
side to a long-lived container that *does* have them, and have the Vercel
route forward the multipart form-data over HTTP to here.

Endpoints
---------
- GET  /health         -> liveness/readiness probe
- POST /analyze        -> aliya-mode scoring (full take)
- POST /analyze-word   -> word-drill mode (single word)

Both POST endpoints accept the SAME multipart fields the existing Vercel
routes accept, plus they swap the `cantorAudio` / `cantorWordsJson`
*relative* paths for `cantorAudioUrl` / `cantorWordsJsonUrl` *full* URLs
that the service can fetch from on its own. The Vercel route is
responsible for prefixing the deployment origin.

Auth
----
A static bearer token in `PARASHA_ANALYZE_TOKEN` (env var). The Vercel
route sends it in `Authorization: Bearer <token>`; if the env var is
unset on the service, auth is disabled (only do this for local dev).

Caching
-------
- Reference audio + words JSON are downloaded to /var/cache/parasha/refs
  on first use, keyed by URL hash, then reused.
- The analyze script keeps its own scripts/.cache/*.npz cache for F0/MFCC
  contours of the reference. That cache lives at /var/cache/parasha/script
  in the container (script's CACHE_DIR is symlinked there in the
  Dockerfile so a container restart doesn't lose it across rebuilds when
  the cache volume is persisted).
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

import httpx
from fastapi import FastAPI, Form, HTTPException, Request, UploadFile, File
from fastapi.responses import JSONResponse


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

# Repo root inside the container (where scripts/analyze_audio.py lives).
# In the Dockerfile we COPY the repo to /app, so this resolves to /app.
REPO_ROOT = Path(os.environ.get("PARASHA_REPO_ROOT", "/app")).resolve()
SCRIPT_PATH = REPO_ROOT / "scripts" / "analyze_audio.py"

# Where we cache downloaded reference assets across requests. Mount a
# persistent volume here in production so the cache survives restarts.
CACHE_ROOT = Path(os.environ.get("PARASHA_CACHE_ROOT", "/var/cache/parasha")).resolve()
REFS_CACHE = CACHE_ROOT / "refs"

# Shared bearer token. When unset, auth is disabled (dev only).
EXPECTED_TOKEN = os.environ.get("PARASHA_ANALYZE_TOKEN", "").strip() or None

# Hard cap so a runaway analysis can't pin a worker forever.
SUBPROCESS_TIMEOUT_S = float(os.environ.get("PARASHA_SUBPROCESS_TIMEOUT_S", "120"))

# Hosts we'll fetch reference assets from. Anything else is rejected so
# this service can't be turned into an open redirect / SSRF amplifier.
ALLOWED_HOSTS = {
    h.strip().lower()
    for h in os.environ.get("PARASHA_ALLOWED_REF_HOSTS", "").split(",")
    if h.strip()
}


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(title="parasha-analyze", version="1.0.0")


@app.on_event("startup")
async def _on_startup() -> None:
    REFS_CACHE.mkdir(parents=True, exist_ok=True)
    if not SCRIPT_PATH.exists():
        # Fail fast on misconfigured deploy — the container can't do its
        # one job without the script.
        raise RuntimeError(f"analyze_audio.py not found at {SCRIPT_PATH}")


@app.get("/health")
async def health() -> dict:
    return {
        "ok": True,
        "script": SCRIPT_PATH.exists(),
        "auth_enabled": EXPECTED_TOKEN is not None,
        "allowed_hosts": sorted(ALLOWED_HOSTS) or "*",
    }


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


def _check_auth(request: Request) -> None:
    if EXPECTED_TOKEN is None:
        return  # auth disabled (dev only)
    header = request.headers.get("authorization", "")
    if not header.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="missing bearer token")
    token = header.split(" ", 1)[1].strip()
    if token != EXPECTED_TOKEN:
        raise HTTPException(status_code=403, detail="invalid token")


# ---------------------------------------------------------------------------
# Reference asset cache
# ---------------------------------------------------------------------------


def _is_allowed_url(url: str) -> bool:
    """SSRF guard: only fetch from the hosts on the allow-list (if set)."""
    try:
        parsed = urlparse(url)
    except Exception:
        return False
    if parsed.scheme not in ("http", "https"):
        return False
    if not parsed.hostname:
        return False
    if not ALLOWED_HOSTS:
        # No allow-list configured — allow anything. Only safe in dev.
        return True
    return parsed.hostname.lower() in ALLOWED_HOSTS


def _cache_path_for(url: str, suffix: str) -> Path:
    digest = hashlib.sha256(url.encode("utf-8")).hexdigest()[:32]
    return REFS_CACHE / f"{digest}{suffix}"


async def _materialize_remote_asset(url: str, suffix: str) -> Path:
    """
    Download `url` to the on-disk cache (idempotent) and return the local
    path. Subsequent calls for the same URL skip the network entirely.

    `suffix` is appended to the cache filename so librosa picks the right
    audio backend by extension (".mp3", ".wav", ".json").
    """
    if not _is_allowed_url(url):
        raise HTTPException(
            status_code=400,
            detail=f"reference url host not on allow-list: {url}",
        )
    target = _cache_path_for(url, suffix)
    if target.exists() and target.stat().st_size > 0:
        return target

    tmp = target.with_suffix(target.suffix + ".part")
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        r = await client.get(url)
        if r.status_code != 200:
            raise HTTPException(
                status_code=404,
                detail=f"reference fetch failed ({r.status_code}): {url}",
            )
        # Write to a sibling temp file then atomic-rename so a half-written
        # cache entry from a crash mid-download doesn't poison future calls.
        tmp.write_bytes(r.content)
        tmp.replace(target)
    return target


def _suffix_for_url(url: str, default: str) -> str:
    path = urlparse(url).path
    ext = os.path.splitext(path)[1].lower()
    if ext in (".mp3", ".wav", ".ogg", ".flac", ".m4a", ".json"):
        return ext
    return default


# ---------------------------------------------------------------------------
# Subprocess driver
# ---------------------------------------------------------------------------


async def _run_script(args: list[str]) -> dict:
    """
    Run scripts/analyze_audio.py with `args`, parse its stdout JSON, and
    surface stderr-formatted error JSON (when present) as a 500 response.
    """
    proc = await asyncio.create_subprocess_exec(
        sys.executable,
        str(SCRIPT_PATH),
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        # Run from the repo root so any relative paths inside the script
        # (e.g. fallback word-boundary lookups) still work.
        cwd=str(REPO_ROOT),
    )
    try:
        stdout_b, stderr_b = await asyncio.wait_for(
            proc.communicate(), timeout=SUBPROCESS_TIMEOUT_S
        )
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        raise HTTPException(
            status_code=504,
            detail=f"analysis timed out after {SUBPROCESS_TIMEOUT_S}s",
        )

    stdout = stdout_b.decode("utf-8", errors="replace")
    stderr = stderr_b.decode("utf-8", errors="replace")

    if proc.returncode != 0:
        # The script writes structured JSON to stderr on _emit_error, plain
        # text otherwise. Try the structured form first.
        msg = "Audio analysis failed"
        if stderr.strip().startswith("{"):
            try:
                err_json = json.loads(stderr.strip().splitlines()[-1])
                msg = err_json.get("error", msg)
            except Exception:
                pass
        # Bubble up as 500; the caller sees `{status: "error", error: ...}`.
        return {"_status_code": 500, "status": "error", "error": msg}

    try:
        return json.loads(stdout)
    except Exception:
        return {
            "_status_code": 500,
            "status": "error",
            "error": "failed to parse analysis output",
        }


def _maybe_error_response(result: dict) -> Optional[JSONResponse]:
    code = result.pop("_status_code", None)
    if code is not None and code >= 400:
        return JSONResponse(status_code=code, content=result)
    return None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


def _write_temp_blob(upload: UploadFile, suffix: str) -> str:
    """Persist an uploaded blob to a unique temp file and return its path."""
    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    try:
        # Stream-copy so very large blobs don't pin the whole body in RAM.
        shutil.copyfileobj(upload.file, tmp)
    finally:
        tmp.close()
    return tmp.name


def _sanitize_cantor_id(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    cleaned = "".join(
        ch for ch in raw.strip().lower() if ch.isalnum() or ch in "-_"
    )
    cleaned = cleaned[:64]
    return cleaned or None


@app.post("/analyze")
async def analyze(
    request: Request,
    student: UploadFile = File(...),
    aliyaNum: str = Form(...),
    parasha: str = Form(...),
    cantorId: Optional[str] = Form(None),
    cantorAudioUrl: Optional[str] = Form(None),
    cantorWordsJsonUrl: Optional[str] = Form(None),
    segStart: Optional[float] = Form(None),
    segEnd: Optional[float] = Form(None),
    wordStart: Optional[int] = Form(None),
    wordEnd: Optional[int] = Form(None),
):
    _check_auth(request)

    student_path = _write_temp_blob(student, suffix=".wav")
    try:
        if not cantorAudioUrl:
            raise HTTPException(
                status_code=400, detail="cantorAudioUrl required"
            )
        ref_suffix = _suffix_for_url(cantorAudioUrl, ".mp3")
        ref_path = await _materialize_remote_asset(cantorAudioUrl, ref_suffix)

        words_path: Optional[Path] = None
        if cantorWordsJsonUrl:
            words_path = await _materialize_remote_asset(
                cantorWordsJsonUrl, _suffix_for_url(cantorWordsJsonUrl, ".json")
            )

        cid = _sanitize_cantor_id(cantorId)
        args: list[str] = [
            student_path,
            str(ref_path),
            aliyaNum,
            parasha,
        ]
        if words_path is not None:
            args += ["--words-json", str(words_path)]
        if cid:
            args += [
                "--ref-cache-key",
                f"{parasha.lower()}_aliya{aliyaNum}_{cid}",
            ]
        if (
            segStart is not None
            and segEnd is not None
            and segEnd > segStart
        ):
            args += ["--seg-start", str(segStart), "--seg-end", str(segEnd)]
            if (
                wordStart is not None
                and wordEnd is not None
                and wordEnd >= wordStart
                and wordStart >= 0
            ):
                args += [
                    "--word-start",
                    str(wordStart),
                    "--word-end",
                    str(wordEnd),
                ]

        result = await _run_script(args)
        err = _maybe_error_response(result)
        if err is not None:
            return err
        return JSONResponse(content=result)
    finally:
        try:
            os.unlink(student_path)
        except FileNotFoundError:
            pass


@app.post("/analyze-word")
async def analyze_word(
    request: Request,
    student: UploadFile = File(...),
    aliyaNum: str = Form(...),
    parasha: str = Form(...),
    wordIdx: int = Form(...),
    cantorId: Optional[str] = Form(None),
    cantorAudioUrl: Optional[str] = Form(None),
    cantorWordsJsonUrl: Optional[str] = Form(None),
):
    _check_auth(request)

    if wordIdx < 0:
        raise HTTPException(status_code=400, detail="wordIdx must be >= 0")

    student_path = _write_temp_blob(student, suffix=".wav")
    try:
        if not cantorAudioUrl:
            raise HTTPException(
                status_code=400, detail="cantorAudioUrl required"
            )
        ref_suffix = _suffix_for_url(cantorAudioUrl, ".mp3")
        ref_path = await _materialize_remote_asset(cantorAudioUrl, ref_suffix)

        words_path: Optional[Path] = None
        if cantorWordsJsonUrl:
            words_path = await _materialize_remote_asset(
                cantorWordsJsonUrl, _suffix_for_url(cantorWordsJsonUrl, ".json")
            )

        cid = _sanitize_cantor_id(cantorId)
        args: list[str] = [
            student_path,
            str(ref_path),
            aliyaNum,
            parasha,
            "--word",
            str(wordIdx),
        ]
        if words_path is not None:
            args += ["--words-json", str(words_path)]
        if cid:
            args += [
                "--ref-cache-key",
                f"{parasha.lower()}_aliya{aliyaNum}_{cid}",
            ]

        result = await _run_script(args)
        err = _maybe_error_response(result)
        if err is not None:
            return err
        return JSONResponse(content=result)
    finally:
        try:
            os.unlink(student_path)
        except FileNotFoundError:
            pass

### Build the parasha audio-analyze service.
###
### Layout inside the image:
###   /app/service/main.py            ← FastAPI app (this dir)
###   /app/scripts/analyze_audio.py   ← analysis script (copied from repo)
###   /var/cache/parasha/             ← ref-asset + script F0/MFCC cache
###
### The script's own CACHE_DIR is `<scripts dir>/.cache`. We symlink that
### onto the persistent volume so cached F0 contours survive restarts.

FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# librosa's mp3 path goes through audioread → ffmpeg, and soundfile
# needs libsndfile.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ffmpeg \
        libsndfile1 \
        ca-certificates \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first so layer cache survives source-only changes.
COPY service/requirements.txt /app/service/requirements.txt
RUN pip install -r /app/service/requirements.txt

# Copy only what the service actually needs: the FastAPI app and the
# analyze script (plus any helpers it imports — currently none).
COPY service /app/service
COPY scripts/analyze_audio.py /app/scripts/analyze_audio.py

# Persistent cache directory + symlink the script's CACHE_DIR onto it so
# extract_f0_cached / extract_mfcc_cached writes survive container
# restarts when /var/cache/parasha is a mounted volume.
RUN mkdir -p /var/cache/parasha/refs /var/cache/parasha/script \
    && ln -s /var/cache/parasha/script /app/scripts/.cache

ENV PARASHA_REPO_ROOT=/app \
    PARASHA_CACHE_ROOT=/var/cache/parasha \
    PORT=8080

EXPOSE 8080

# Single worker by default so the F0/MFCC cache isn't fought over. Scale
# horizontally (more replicas) instead of vertically (more workers per
# container) — librosa is GIL-bound on a single CPU anyway.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://127.0.0.1:${PORT}/health || exit 1

CMD ["sh", "-c", "uvicorn service.main:app --host 0.0.0.0 --port ${PORT} --workers 1 --proxy-headers --forwarded-allow-ips=*"]

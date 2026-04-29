# parasha-analyze service

Long-running Python container that runs `scripts/analyze_audio.py`.

The Vercel app forwards `POST /api/parasha/analyze` and `POST
/api/parasha/analyze-word` here whenever `PARASHA_ANALYZE_URL` is set on
the Vercel project. See [../README.md](../README.md) for the Vercel-side
configuration.

## Endpoints

| Method | Path             | Description                                         |
|--------|------------------|-----------------------------------------------------|
| `GET`  | `/health`        | Liveness/readiness probe                             |
| `POST` | `/analyze`       | Aliya-mode scoring (full take, optional segment)    |
| `POST` | `/analyze-word`  | Single-word drill                                   |

Both `POST` endpoints accept multipart `form-data`:

| Field                  | Required | Description                                                |
|------------------------|----------|------------------------------------------------------------|
| `student`              | yes      | Recorded audio (browser blob, typically `audio/webm`/wav)  |
| `aliyaNum`             | yes      | Aliya number, e.g. `"1"`                                   |
| `parasha`              | yes      | Parasha id, e.g. `"Miketz"`                                |
| `cantorAudioUrl`       | yes      | Full https URL of the cantor reference audio               |
| `cantorWordsJsonUrl`   | no       | Full https URL of the cantor's pre-aligned words JSON      |
| `cantorId`             | no       | Stable cantor id (drives the F0/MFCC cache key)            |
| `segStart` / `segEnd`  | no       | (`/analyze`) Cantor-time slice the student re-sang         |
| `wordStart`/`wordEnd`  | no       | (`/analyze`) Inclusive flat-word indices in that slice     |
| `wordIdx`              | yes      | (`/analyze-word`) Single-word index                        |

The Vercel route is responsible for prefixing the deployment origin onto
the cantor asset paths before forwarding (e.g. it sends
`https://hebrew-game-eight.vercel.app/parasha/miketz/audio/aliya1.mp3`,
not `/parasha/miketz/audio/aliya1.mp3`).

## Auth

Set `PARASHA_ANALYZE_TOKEN` on the service. The Vercel route sends it as
`Authorization: Bearer <token>`. Leave the env var unset (only) for
local dev to disable auth.

## Required env vars

| Name                          | Required | Default                  | Notes                                                                        |
|-------------------------------|----------|--------------------------|------------------------------------------------------------------------------|
| `PARASHA_ANALYZE_TOKEN`       | yes      | (none → auth disabled)   | Shared bearer token. Generate with `openssl rand -base64 32`.                |
| `PARASHA_ALLOWED_REF_HOSTS`   | recommended | (empty → allow any)   | Comma-separated host allow-list for `cantorAudioUrl`. SSRF guard.            |
| `PARASHA_CACHE_ROOT`          | no       | `/var/cache/parasha`     | Where ref assets + script F0/MFCC cache live. Mount a volume here.           |
| `PARASHA_SUBPROCESS_TIMEOUT_S`| no       | `120`                    | Hard cap on a single analysis run.                                           |
| `PORT`                        | no       | `8080`                   | HTTP port the container listens on.                                          |

Set `PARASHA_ALLOWED_REF_HOSTS=hebrew-game-eight.vercel.app` (and any
preview hosts you forward from) so the service can't be coerced into
fetching arbitrary URLs.

## Run locally

```bash
docker build -f service/Dockerfile -t parasha-analyze .
docker run --rm -p 8080:8080 \
  -e PARASHA_ANALYZE_TOKEN=devtoken \
  -e PARASHA_ALLOWED_REF_HOSTS=hebrew-game-eight.vercel.app \
  -v $(pwd)/.parasha-cache:/var/cache/parasha \
  parasha-analyze
```

Then point your local Next.js dev server at it:

```bash
# .env.local
PARASHA_ANALYZE_URL=http://localhost:8080
PARASHA_ANALYZE_TOKEN=devtoken
```

## Deploy

### Railway (simplest)

1. New project → Empty service → "Deploy from GitHub" or "Deploy from local dir"
2. Pick the repo root as the build context
3. Set the Dockerfile path to `service/Dockerfile`
4. Add a persistent volume mounted at `/var/cache/parasha` (1 GB is plenty)
5. Set env vars: `PARASHA_ANALYZE_TOKEN`, `PARASHA_ALLOWED_REF_HOSTS`
6. Deploy. Note the public URL (e.g. `https://parasha-analyze.up.railway.app`)
7. On the **Vercel** project, set `PARASHA_ANALYZE_URL` and `PARASHA_ANALYZE_TOKEN` env vars to match. Redeploy Vercel.

### Fly.io

```bash
cd service
flyctl launch --no-deploy --copy-config --dockerfile Dockerfile
flyctl volumes create parasha_cache --size 1
flyctl secrets set PARASHA_ANALYZE_TOKEN=$(openssl rand -base64 32)
flyctl secrets set PARASHA_ALLOWED_REF_HOSTS=hebrew-game-eight.vercel.app
flyctl deploy
```

Then mirror the token into Vercel as `PARASHA_ANALYZE_TOKEN` and set
`PARASHA_ANALYZE_URL` to the Fly app URL.

### Google Cloud Run

```bash
gcloud run deploy parasha-analyze \
  --source . \
  --region us-central1 \
  --no-cpu-throttling \
  --memory 1Gi \
  --max-instances 5 \
  --set-env-vars PARASHA_ALLOWED_REF_HOSTS=hebrew-game-eight.vercel.app \
  --update-secrets PARASHA_ANALYZE_TOKEN=parasha-analyze-token:latest
```

Cloud Run doesn't keep local disk between invocations, so the in-memory
ref cache is per-instance and the on-disk script cache is per-instance
too. With `--no-cpu-throttling` and `--max-instances` low, you'll keep a
warm instance most of the time and the cache will stay populated.

## Troubleshooting

- **`{"status":"error","error":"Audio analysis failed"}`** — check the
  service logs; the Python script's stderr is printed there.
- **`reference url host not on allow-list`** — add the Vercel deployment
  host to `PARASHA_ALLOWED_REF_HOSTS`.
- **`reference fetch failed (401/403)`** — the asset URL is gated by the
  Vercel proxy. Make sure it's a public-asset path
  (`/parasha/.../audio/...mp3`); only those are allowlisted in
  `proxy.ts`.
- **Slow first request per (parasha, aliya, cantor)** — expected. The
  script computes and caches the cantor's F0/MFCC contours on the first
  call (~5–15 s for a multi-minute aliya); subsequent calls reuse the
  cache and are 5–10× faster.

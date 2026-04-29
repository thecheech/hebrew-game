# Hebrew word match

A small Next.js game: read a Hebrew word **with nikud** (vowel marks), then choose its correct **English transliteration** (how to pronounce it). After each round we also reveal the English meaning. **20 levels** (beginner → advanced), **10 rounds** per run, a **countdown timer** (per-level defaults or your own override in settings), and a floating **cheatsheet** of letters and nikud with English-style pronunciation hints.

- **Scoring:** easy = 1 pt, medium = 2 pts, hard = 3 pts per correct answer.
- **Data:** curated list in [`data/words.json`](data/words.json) (~290 entries). Regenerate from the pipe-delimited source in [`scripts/seed-words.mjs`](scripts/seed-words.mjs) with `npm run seed-words`.

## Develop

```bash
npm install
cp .env.example .env.local
```

Set real values in `.env.local` (see `.env.example`):

- **`DATABASE_URL`** — Neon's **pooled** connection string (hostname contains `-pooler`; used at runtime by Prisma's Neon adapter).
- **`DIRECT_URL`** — Neon's **direct** connection string (same branch, without pooler; used by `prisma migrate`). On [Vercel’s Neon integration](https://neon.com/docs/guides/vercel-managed-integration) this is exposed as `DATABASE_URL_UNPOOLED`; locally you can paste it as `DIRECT_URL` or set `DATABASE_URL_UNPOOLED` to match.
- **`AUTH_SECRET`** — run `openssl rand -base64 32` and paste the result.
- **`AUTH_URL`** — e.g. `http://localhost:3000` locally, or your production URL on Vercel (`https://your-domain.com`).
- **`AUTH_RESEND_KEY`** (or **`RESEND_API_KEY`**) / **`AUTH_RESEND_FROM`** — [Resend](https://resend.com). The `from` address must use a **verified domain** (e.g. `noreply@topupcredits.com`); unverified senders only work for the account’s test inbox.
- **`AUTH_APP_NAME`** — optional; used in the Resend sign-in email subject/body (default: **Bar Mitzva App**). Magic links still use your real deployment URL.
- **`AUTH_GOOGLE_ID`** / **`AUTH_GOOGLE_SECRET`** — if you use Google sign-in.

Apply the database schema (required for email magic links):

```bash
npx prisma migrate deploy
```

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), pick a level, then play. Use keys **1–4** to select answers during a round.

## Build

```bash
npm run build
npm start
```

## Deploy (Vercel + Neon)

1. Push the repo to GitHub (or GitLab / Bitbucket).
2. In [Vercel](https://vercel.com), **Import** the repository.
3. Framework preset: **Next.js**. Root directory: this project folder.
4. Connect **[Neon](https://neon.com/docs/guides/vercel-managed-integration)** to the Vercel project (**Storage** in the project, or **Integrations → Neon**). This injects **`DATABASE_URL`** (pooled) and **`DATABASE_URL_UNPOOLED`** (direct). Prisma Migrate uses the unpooled URL via `prisma.config.ts`; the app uses the pooled URL with `@prisma/adapter-neon`.
5. Add the remaining environment variables (not provisioned by Neon):
   - `AUTH_SECRET` (run `openssl rand -base64 32`)
   - `AUTH_URL` (production site URL, e.g. `https://your-project.vercel.app`)
   - `AUTH_RESEND_KEY`, `AUTH_RESEND_FROM`
   - `AUTH_APP_NAME` (optional; defaults to **Bar Mitzva App** in magic-link emails)
   - `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` if using Google sign-in
6. Deploy. `npm run build` runs `prisma generate`, `prisma migrate deploy` (needs `DATABASE_URL_UNPOOLED` or equivalent in the build environment), then `next build`.

## Practice scoring (Python audio analysis)

The "Practice with mic" feature on `/parasha/<slug>` records the user, then
posts the take to `/api/parasha/analyze` (or `/api/parasha/analyze-word`).
That route runs `scripts/analyze_audio.py` (librosa + scipy + numpy) to
compare the student's pitch contour against the cantor's.

**Vercel's Node.js serverless runtime can't run Python**, so in production
the route forwards the multipart request to an external Python service.
See [`service/README.md`](service/README.md) for the FastAPI app +
Dockerfile and step-by-step Railway / Fly.io / Cloud Run deploy
instructions.

Add these env vars to the Vercel project once the service is live:

- `PARASHA_ANALYZE_URL` — public URL of the deployed service (e.g.
  `https://parasha-analyze.up.railway.app`). Setting this flips the
  routes from local-subprocess to remote-forward mode.
- `PARASHA_ANALYZE_TOKEN` — shared bearer token; must match the value
  set on the service. Generate with `openssl rand -base64 32`.

When `PARASHA_ANALYZE_URL` is unset, the routes fall back to spawning
`python3` locally — convenient for `npm run dev` against
`scripts/.venv/bin/python`. If the binary is also missing (i.e.
production with no service configured), the routes return `503` with a
friendly message instead of an opaque 500.

## Stack

Next.js 16 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui (Base UI), Zustand, Auth.js + Prisma + Neon (`@prisma/adapter-neon`), `Frank Ruhl Libre` for Hebrew text.

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

- **`DATABASE_URL`** — Postgres connection string (e.g. [Neon](https://neon.tech) free tier).
- **`AUTH_SECRET`** — run `openssl rand -base64 32` and paste the result.
- **`AUTH_URL`** — e.g. `http://localhost:3000` locally, or your production URL on Vercel (`https://your-domain.com`).
- **`AUTH_RESEND_KEY`** / **`AUTH_RESEND_FROM`** — from [Resend](https://resend.com); verify your domain or use their test sender for development.
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

## Deploy (Vercel)

1. Push the repo to GitHub (or GitLab / Bitbucket).
2. In [Vercel](https://vercel.com), **Import** the repository.
3. Framework preset: **Next.js**. Root directory: this project folder.
4. Add environment variables (see `.env.example`):
   - `DATABASE_URL` (Postgres — Auth.js needs this for email magic links)
   - `AUTH_SECRET` (run `openssl rand -base64 32`)
   - `AUTH_URL` (production site URL, e.g. `https://your-project.vercel.app`)
   - `AUTH_RESEND_KEY`, `AUTH_RESEND_FROM`
   - `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` if using Google sign-in
5. Deploy. The default `npm run build` runs `prisma generate`, applies migrations with `prisma migrate deploy`, then builds Next.js — ensure `DATABASE_URL` is set on Vercel so migrations succeed.

## Stack

Next.js 16 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui (Base UI), Zustand, Auth.js + Prisma (Postgres for magic links), `Frank Ruhl Libre` for Hebrew text.

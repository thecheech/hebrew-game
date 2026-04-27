# Hebrew word match

A small Next.js game: read a Hebrew word **with nikud** (vowel marks), then choose its correct **English transliteration** (how to pronounce it). After each round we also reveal the English meaning. **20 levels** (beginner → advanced), **10 rounds** per run, a **countdown timer** (per-level defaults or your own override in settings), and a floating **cheatsheet** of letters and nikud with English-style pronunciation hints.

- **Scoring:** easy = 1 pt, medium = 2 pts, hard = 3 pts per correct answer.
- **Data:** curated list in [`data/words.json`](data/words.json) (~290 entries). Regenerate from the pipe-delimited source in [`scripts/seed-words.mjs`](scripts/seed-words.mjs) with `npm run seed-words`.

## Develop

```bash
npm install
cp .env.example .env.local
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
4. Add environment variables:
   - `AUTH_RESEND_KEY` (Resend API key)
   - `AUTH_RESEND_FROM` (email sender, e.g. `Hebrew Game <onboarding@resend.dev>`)
5. Deploy.

## Stack

Next.js 16 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui (Base UI), Zustand, `Frank Ruhl Libre` for Hebrew text.

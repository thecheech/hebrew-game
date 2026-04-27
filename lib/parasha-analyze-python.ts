/**
 * Executable used to run `scripts/analyze_audio.py`.
 *
 * Default is `python3` on PATH (works on Vercel and CI). For a local venv,
 * set in `.env.local`, for example:
 *   PARASHA_ANALYZE_PYTHON=./scripts/.venv/bin/python
 *
 * We avoid hard-coding `scripts/.venv/...` in route modules: a typical venv
 * `python` symlink points outside the project root, which breaks Turbopack
 * during `next build`.
 */
export function resolveParashaAnalyzePython(): string {
  const fromEnv = process.env.PARASHA_ANALYZE_PYTHON?.trim();
  if (fromEnv) return fromEnv;
  return "python3";
}

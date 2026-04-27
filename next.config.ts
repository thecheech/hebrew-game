import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
  // These routes only need public/parasha assets at runtime. Tracing used
  // to pull every MP3/JSON into the serverless bundle (~300MB+ on Vercel).
  // We exclude them and load assets via fetch + temp file instead.
  outputFileTracingExcludes: {
    "/api/parasha/analyze": ["./public/parasha/**/*"],
    "/api/parasha/analyze-word": ["./public/parasha/**/*"],
  },
};

export default nextConfig;

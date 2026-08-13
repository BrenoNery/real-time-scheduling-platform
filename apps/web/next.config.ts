import type { NextConfig } from "next";
import { config as loadEnv } from "dotenv";
import path from "path";

// In this monorepo the canonical env lives at the repo root. Next.js only
// auto-loads .env* files from its own project directory (apps/web/), so we
// load the root file explicitly here. Already-set env vars — e.g. set by CI
// or by a local apps/web/.env.local — always take precedence (override: false).
loadEnv({ path: path.resolve(process.cwd(), "../../.env"), override: false });

const nextConfig: NextConfig = {
  transpilePackages: ["@repo/database"],
};

export default nextConfig;

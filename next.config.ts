import path from "node:path";
import { fileURLToPath } from "node:url";
import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * `BUILD_TARGET=worker` builds the render worker's app: the public app plus the render harness,
 * whose page is `src/app/render-harness/page.worker.tsx`. Every other build, dev servers
 * included, leaves `*.worker.tsx` pages out, so the public app has no harness route at all
 * (ADR 0005). Build and start a worker app with the same setting.
 */
const PAGE_EXTENSIONS = ["tsx", "ts", "jsx", "js"];
const isWorkerBuild = process.env.BUILD_TARGET === "worker";

const nextConfig: NextConfig = {
  output: "standalone",
  distDir: process.env.NEXT_BUILD_DIR || ".next",
  pageExtensions: isWorkerBuild ? ["worker.tsx", ...PAGE_EXTENSIONS] : PAGE_EXTENSIONS,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // The film previews became the home page.
  async redirects() {
    return ["/home-2", "/home-3"].map((source) => ({ source, destination: "/", permanent: false }));
  },
  serverExternalPackages: [
    "draco3dgltf",
    "draco3d",
    "@gltf-transform/core",
    "@gltf-transform/extensions",
    "@gltf-transform/functions",
    "meshoptimizer",
  ],
  turbopack: {
    root: rootDir,
    resolveAlias: {
      tailwindcss: path.join(rootDir, "node_modules/tailwindcss"),
      "tw-animate-css": path.join(rootDir, "node_modules/tw-animate-css"),
      shadcn: path.join(rootDir, "node_modules/shadcn"),
      // Published stats.js omits build/stats.min.js; point at the source module.
      "stats.js": path.join(rootDir, "node_modules/stats.js/src/Stats.js"),
    },
  },
  webpack: (config, { isServer }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "stats.js": path.join(rootDir, "node_modules/stats.js/src/Stats.js"),
    };
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
      };
    }
    return config;
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
});

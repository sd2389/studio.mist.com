import path from "node:path";
import { fileURLToPath } from "node:url";
import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1", "localhost"],
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

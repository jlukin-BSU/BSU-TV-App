import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";

// Plugins (e.g. 'esbuild-plugin-pino') may use `require` to resolve dependencies
globalThis.require = createRequire(import.meta.url);

const { default: esbuildPluginPino } = await import("esbuild-plugin-pino");

const artifactDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Bundles the server to dist/index.mjs.
 *
 * Note this does NOT clear dist/, because `vite build` has already written the
 * frontend into dist/public and the server serves it from there.
 */
async function buildServer() {
  await esbuild({
    entryPoints: [path.resolve(artifactDir, "src/server/index.ts")],
    platform: "node",
    target: "node20",
    bundle: true,
    format: "esm",
    outdir: path.resolve(artifactDir, "dist"),
    outExtension: { ".js": ".mjs" },
    logLevel: "info",
    external: ["*.node"],
    sourcemap: "linked",
    plugins: [
      // pino relies on workers to handle logging, so it needs the plugin rather
      // than being externalised.
      esbuildPluginPino({ transports: ["pino-pretty"] }),
    ],
    // Keep cjs-only packages (e.g. express) working inside our esm output.
    banner: {
      js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
    `,
    },
  });
}

buildServer().catch((err) => {
  console.error(err);
  process.exit(1);
});

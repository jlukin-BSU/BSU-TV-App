import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const artifactDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * The frontend is loaded by the display's built-in browser (Sony's HTML5 app /
 * "Initial input source" custom URL). That browser is an older Chromium build,
 * so we transpile down to es2015 and avoid modern syntax in the output.
 */
export default defineConfig({
  root: path.resolve(artifactDir, "src/web"),
  build: {
    target: "es2015",
    outDir: path.resolve(artifactDir, "dist/public"),
    emptyOutDir: true,
  },
  plugins: [react()],
  server: {
    // `pnpm dev:web` serves the UI on :5173 and proxies API calls to the server.
    proxy: {
      "/api": "http://127.0.0.1:8080",
    },
  },
});

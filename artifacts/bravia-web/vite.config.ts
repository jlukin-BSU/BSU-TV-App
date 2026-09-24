import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const artifactDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * The frontend is loaded by the display's built-in browser (Sony's HTML5 app /
 * "Initial input source" custom URL), an older Chromium build, so JS targets
 * es2015. The UI is ported from artifacts/bsu-tv-hub, so it keeps that app's
 * `@` and `@assets` aliases and its shared attached_assets folder.
 */
export default defineConfig({
  root: path.resolve(artifactDir, "src/web"),
  resolve: {
    alias: {
      "@": path.resolve(artifactDir, "src/web"),
      "@assets": path.resolve(artifactDir, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  plugins: [react(), tailwindcss()],
  build: {
    target: "es2015",
    // Downlevel Tailwind 4's modern CSS (color-mix, oklch, nesting) for the
    // display's older browser.
    cssTarget: "chrome61",
    outDir: path.resolve(artifactDir, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    // `pnpm exec vite` serves the UI and proxies API calls to the server.
    proxy: {
      "/api": "http://127.0.0.1:8080",
    },
  },
});

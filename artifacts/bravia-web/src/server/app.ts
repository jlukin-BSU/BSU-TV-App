import express, { type Express } from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import pinoHttp from "pino-http";
import { createRouter } from "./routes";
import { logger } from "./lib/logger";
import type { AppConfig } from "./lib/config";
import type { SettingsStore } from "./lib/settings";

const here = path.dirname(fileURLToPath(import.meta.url));

function publicDir(): string {
  const fromEnv = process.env["PUBLIC_DIR"];
  if (fromEnv && fromEnv.trim() !== "") return path.resolve(fromEnv.trim());
  // In the bundled output this file is dist/index.mjs, so the UI is dist/public.
  return path.resolve(here, "public");
}

export function createApp(config: AppConfig, store: SettingsStore): Express {
  const app: Express = express();

  /**
   * Source IP is the identity that selects which display is commanded and which
   * PSK is used, so getting `req.ip` right is security-critical.
   *
   * By default the service is exposed directly (Node on port 80, no proxy), so
   * trust proxy is OFF: `req.ip` is the raw socket peer and any client-supplied
   * X-Forwarded-For is ignored -- a display cannot forge its identity.
   *
   * If a reverse proxy is ever put in front, set TRUST_PROXY to its hop spec
   * (e.g. "loopback") AND make that proxy OVERWRITE X-Forwarded-For with the
   * real client address (append-style forwarding would reintroduce spoofing).
   */
  const trustProxy = process.env["TRUST_PROXY"];
  app.set("trust proxy", trustProxy && trustProxy.trim() !== "" ? trustProxy.trim() : false);
  app.disable("x-powered-by");

  app.use(
    pinoHttp({
      logger,
      serializers: {
        req(req) {
          return {
            id: req.id,
            method: req.method,
            url: req.url?.split("?")[0],
            remoteAddress: req.remoteAddress,
          };
        },
        res(res) {
          return { statusCode: res.statusCode };
        },
      },
    }),
  );

  app.use(express.json({ limit: "16kb" }));

  /**
   * No CORS middleware on purpose. The UI is served by this same origin, and
   * every request is authorised by its source IP -- opening the API up to
   * cross-origin callers would only widen what can reach the displays.
   */
  app.use("/api", createRouter(config, store));

  const uiDir = publicDir();
  if (fs.existsSync(uiDir)) {
    app.use(
      express.static(uiDir, {
        // index.html must not be cached, or displays keep a stale bundle after a deploy.
        setHeaders(res, filePath) {
          if (filePath.endsWith("index.html")) {
            res.setHeader("Cache-Control", "no-cache");
          }
        },
      }),
    );

    // Anything that is not an API route falls through to the UI.
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.sendFile(path.join(uiDir, "index.html"));
    });
  } else {
    logger.warn(
      { uiDir },
      "Frontend build not found -- run `pnpm run build:web`. API routes still work.",
    );
  }

  return app;
}

export default createApp;

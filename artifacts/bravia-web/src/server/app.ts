import express, { type Express } from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import pinoHttp from "pino-http";
import { createRouter } from "./routes";
import { logger } from "./lib/logger";
import type { AppConfig } from "./lib/config";

const here = path.dirname(fileURLToPath(import.meta.url));

function publicDir(): string {
  const fromEnv = process.env["PUBLIC_DIR"];
  if (fromEnv && fromEnv.trim() !== "") return path.resolve(fromEnv.trim());
  // In the bundled output this file is dist/index.mjs, so the UI is dist/public.
  return path.resolve(here, "public");
}

export function createApp(config: AppConfig): Express {
  const app: Express = express();

  /**
   * Only the loopback nginx hop is trusted. Combined with nginx *overwriting*
   * X-Forwarded-For (see deploy/nginx-bravia-web.conf), this makes `req.ip` the
   * display's real address and unspoofable from the client side.
   *
   * This matters more than usual here: source IP is the identity that selects
   * which display gets commanded and which PSK is used.
   */
  app.set("trust proxy", "loopback");
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
  app.use("/api", createRouter(config));

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

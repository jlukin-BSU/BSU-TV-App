import express, { type Express } from "express";
import pinoHttp from "pino-http";
import type { AppConfig } from "./lib/config";
import type { SettingsStore } from "./lib/settings";
import type { AppOverridesStore } from "./lib/app-overrides";
import { createManageRouter } from "./routes/manage";
import { managePage } from "./manage/page";
import { logger } from "./lib/logger";

/**
 * The management app (device registration). Runs on its own port, separate from
 * the display control plane. Serves a self-contained page and a password-gated
 * CRUD API over the shared live registry.
 */
export function createManageApp(config: AppConfig, store: SettingsStore, appOverrides: AppOverridesStore): Express {
  const app: Express = express();

  // Trust nothing about forwarding here; there is no proxy in front.
  app.set("trust proxy", false);
  app.disable("x-powered-by");

  app.use(
    pinoHttp({
      logger,
      serializers: {
        req(req) {
          return { method: req.method, url: req.url?.split("?")[0] };
        },
        res(res) {
          return { statusCode: res.statusCode };
        },
      },
    }),
  );

  app.use(express.json({ limit: "16kb" }));

  app.use("/api", createManageRouter(config, store, appOverrides));

  app.get("/", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.send(managePage);
  });

  // Health for the management port too.
  app.get("/healthz", (_req, res) => res.json({ status: "ok" }));

  return app;
}

export default createManageApp;

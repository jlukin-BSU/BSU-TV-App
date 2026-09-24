import express, { type Express } from "express";
import pinoHttp from "pino-http";
import type { AppConfig } from "./lib/config";
import type { DashPinStore } from "./lib/dash-auth";
import type { AppOverridesStore } from "./lib/app-overrides";
import { createDashboardRouter } from "./routes/dashboard";
import { dashboardPage } from "./dashboard/page";
import { logger } from "./lib/logger";

/**
 * The monitoring dashboard app. Its own port, LAN-reachable, so a building
 * manager can open it on any device. Serves one page ("/" = master, "/b/CODE" =
 * a building) and a PIN-gated state/control API over the live registry.
 */
export function createDashboardApp(
  config: AppConfig,
  pins: DashPinStore,
  appOverrides: AppOverridesStore,
): Express {
  const app: Express = express();
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
  app.use("/api", createDashboardRouter(config, pins, appOverrides));

  const servePage = (_req: express.Request, res: express.Response): void => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.send(dashboardPage);
  };
  app.get("/", servePage);
  app.get("/b/:building", servePage);
  app.get("/healthz", (_req, res) => res.json({ status: "ok" }));

  return app;
}

export default createDashboardApp;

import { Router, type IRouter } from "express";
import type { AppConfig } from "../lib/config";
import { normalizeIp } from "../lib/ip";
import { resolveDevice } from "../middlewares/device";
import { getWeather } from "../lib/weather";
import { logger } from "../lib/logger";
import type { SettingsStore } from "../lib/settings";
import healthRouter from "./health";
import { createControlRouter } from "./control";
import { createAdminRouter } from "./admin";

/**
 * `/healthz`, `/whoami` and `/weather` are open. Everything else must be
 * attributable to a known display, so it sits behind `resolveDevice`. The admin
 * routes add their own password check on top.
 */
export function createRouter(config: AppConfig, store: SettingsStore): IRouter {
  const router: IRouter = Router();

  router.use(healthRouter);

  /** Echo back what the server thinks the caller's IP is. Handy when wiring up nginx. */
  router.get("/whoami", (req, res) => {
    const sourceIp = normalizeIp(req.ip ?? "");
    const display = config.byIp.get(sourceIp);
    res.json({
      rawIp: req.ip ?? null,
      sourceIp,
      registered: Boolean(display),
      hostname: display?.hostname ?? null,
    });
  });

  /** Weather for the header. Open (not display-specific) and cached server-side. */
  router.get("/weather", async (_req, res) => {
    try {
      res.json(await getWeather());
    } catch (err) {
      logger.warn({ err: String(err) }, "weather unavailable");
      res.status(503).json({ error: "weather_unavailable" });
    }
  });

  // Everything below requires a known display.
  router.use(resolveDevice(config));
  router.use("/admin", createAdminRouter(store));
  router.use(createControlRouter(store));

  return router;
}

export default createRouter;

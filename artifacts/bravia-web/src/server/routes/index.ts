import { Router, type IRouter } from "express";
import type { AppConfig } from "../lib/config";
import { normalizeIp } from "../lib/ip";
import { resolveDevice } from "../middlewares/device";
import { getWeather } from "../lib/weather";
import { logger } from "../lib/logger";
import healthRouter from "./health";
import controlRouter from "./control";

/**
 * `/healthz` is open; everything else must be attributable to a known display,
 * so it sits behind `resolveDevice`.
 */
export function createRouter(config: AppConfig): IRouter {
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

  router.use(resolveDevice(config), controlRouter);

  return router;
}

export default createRouter;

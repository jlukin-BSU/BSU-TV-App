import { Router, type IRouter } from "express";
import type { AppConfig } from "../lib/config";
import { normalizeIp } from "../lib/ip";
import { resolveDevice } from "../middlewares/device";
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

  router.use(resolveDevice(config), controlRouter);

  return router;
}

export default createRouter;

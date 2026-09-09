import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import type { AppConfig } from "../lib/config";
import {
  addDevice,
  listEntries,
  removeDevice,
  updateDevice,
  RegistryError,
} from "../lib/registry";
import { checkMgmtPassword } from "../lib/mgmt";
import { logger } from "../lib/logger";

/**
 * Management API: device-registry CRUD, guarded by the management password sent
 * in the X-Manage-Password header (constant-time check). Mutations go through
 * the registry helpers, which validate and persist devices.json and update the
 * live control config in place.
 */

function requireMgmt(req: Request, res: Response, next: NextFunction): void {
  const supplied = req.header("x-manage-password") ?? "";
  if (!checkMgmtPassword(supplied)) {
    res.status(401).json({ error: "unauthorized", message: "Incorrect management password." });
    return;
  }
  next();
}

export function createManageRouter(config: AppConfig): IRouter {
  const router: IRouter = Router();

  /** Password check for the login screen. */
  router.post("/session", requireMgmt, (_req, res) => {
    res.json({ ok: true });
  });

  router.use(requireMgmt);

  /** List all registered displays. */
  router.get("/devices", (_req, res) => {
    res.json({ dryRun: config.globalDryRun, forcedDryRun: config.forcedDryRun, displays: listEntries(config) });
  });

  /** Add a display. */
  router.post("/devices", (req, res) => {
    try {
      const added = addDevice(config, req.body);
      res.status(201).json({ ok: true, device: added });
    } catch (err) {
      respondError(res, err);
    }
  });

  /** Update the display currently at :ip (the IP itself may change in the body). */
  router.put("/devices/:ip", (req, res) => {
    try {
      const updated = updateDevice(config, req.params.ip, req.body);
      res.json({ ok: true, device: updated });
    } catch (err) {
      respondError(res, err);
    }
  });

  /** Remove the display at :ip. */
  router.delete("/devices/:ip", (req, res) => {
    try {
      removeDevice(config, req.params.ip);
      res.json({ ok: true });
    } catch (err) {
      respondError(res, err);
    }
  });

  return router;
}

function respondError(res: Response, err: unknown): void {
  if (err instanceof RegistryError) {
    res.status(400).json({ error: "invalid", message: err.message });
    return;
  }
  logger.error({ err: String(err) }, "management error");
  res.status(500).json({ error: "internal", message: err instanceof Error ? err.message : String(err) });
}

export default createManageRouter;

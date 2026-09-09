import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import type { AppConfig } from "../lib/config";
import {
  addDevice,
  listEntries,
  removeDevice,
  updateDevice,
  RegistryError,
} from "../lib/registry";
import { checkMgmtPin } from "../lib/mgmt";
import { logger } from "../lib/logger";

/**
 * Management API: device-registry CRUD, guarded by the management PIN sent in
 * the X-Manage-Pin header (constant-time check). Mutations go through the
 * registry helpers, which validate and persist devices.json and update the live
 * control config in place.
 */

function requireMgmt(req: Request, res: Response, next: NextFunction): void {
  const supplied = req.header("x-manage-pin") ?? "";
  if (!checkMgmtPin(supplied)) {
    res.status(401).json({ error: "unauthorized", message: "Incorrect PIN." });
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

  /** List all registered displays, with each one's currently-resolved IP. */
  router.get("/devices", (_req, res) => {
    const byHost = new Map(config.displays.map((d) => [d.hostname.trim().toLowerCase(), d]));
    const displays = listEntries(config).map((entry) => {
      const d = byHost.get(entry.hostname.trim().toLowerCase());
      return {
        ...entry,
        resolvedIps: d?.resolvedIps ?? [],
        targetIp: d?.targetIp ?? null,
      };
    });
    res.json({ dryRun: config.globalDryRun, forcedDryRun: config.forcedDryRun, displays });
  });

  /** Add a display. */
  router.post("/devices", async (req, res) => {
    try {
      const added = await addDevice(config, req.body);
      res.status(201).json({ ok: true, device: added });
    } catch (err) {
      respondError(res, err);
    }
  });

  /** Update the display currently registered under :hostname (which may change in the body). */
  router.put("/devices/:hostname", async (req, res) => {
    try {
      const updated = await updateDevice(config, req.params.hostname, req.body);
      res.json({ ok: true, device: updated });
    } catch (err) {
      respondError(res, err);
    }
  });

  /** Remove the display registered under :hostname. */
  router.delete("/devices/:hostname", async (req, res) => {
    try {
      await removeDevice(config, req.params.hostname);
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

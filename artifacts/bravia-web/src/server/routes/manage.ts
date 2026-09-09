import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import type { AppConfig } from "../lib/config";
import {
  addDevice,
  listEntries,
  removeDevice,
  updateDevice,
  RegistryError,
} from "../lib/registry";
import { z } from "zod";
import { checkMgmtPin } from "../lib/mgmt";
import {
  SettingsSaveSchema,
  saveSettingsFor,
  settingsViewFor,
  type SettingsStore,
} from "../lib/settings";
import type { AppOverridesStore } from "../lib/app-overrides";
import type { Display } from "../lib/config";
import { APPS } from "../../shared/catalog";
import { getApplicationList, BraviaError } from "../lib/bravia";
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

const AppTargetSchema = z.object({ value: z.string() }).strict();

export function createManageRouter(
  config: AppConfig,
  store: SettingsStore,
  appOverrides: AppOverridesStore,
): IRouter {
  const router: IRouter = Router();

  const findDisplay = (hostname: string): Display | undefined => {
    const key = hostname.trim().toLowerCase();
    return config.displays.find((d) => d.hostname.trim().toLowerCase() === key);
  };

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

  /** Editable per-display settings (tiles/order/idle/auto-signage) by hostname. */
  router.get("/devices/:hostname/settings", (req, res) => {
    const display = findDisplay(req.params.hostname);
    if (!display) {
      res.status(404).json({ error: "not_found", message: `No display registered with hostname "${req.params.hostname}".` });
      return;
    }
    res.json({ device: { hostname: display.hostname, label: display.label }, ...settingsViewFor(display, store) });
  });

  /** Save per-display settings by hostname. */
  router.put("/devices/:hostname/settings", (req, res) => {
    const display = findDisplay(req.params.hostname);
    if (!display) {
      res.status(404).json({ error: "not_found", message: `No display registered with hostname "${req.params.hostname}".` });
      return;
    }
    const parsed = SettingsSaveSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "bad_request", message: "Expected { enabled, order, autoSignage, idleSeconds }." });
      return;
    }
    const view = saveSettingsFor(display, store, parsed.data);
    logger.info({ display: display.hostname }, "settings saved via management page");
    res.json({ ok: true, ...view });
  });

  /** Editable launch target (package name / URI) for every app. */
  router.get("/apps-config", (_req, res) => {
    res.json({
      apps: APPS.map((a) => {
        const override = appOverrides.get(a.id);
        return {
          id: a.id,
          label: a.label,
          default: a.packageName,
          override: override ?? null,
          effective: override ?? a.packageName,
        };
      }),
    });
  });

  /** Set (or clear, with an empty value) an app's launch target. */
  router.put("/apps-config/:appId", (req, res) => {
    const app = APPS.find((a) => a.id === req.params.appId);
    if (!app) {
      res.status(404).json({ error: "not_found", message: `Unknown app "${req.params.appId}".` });
      return;
    }
    const parsed = AppTargetSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "bad_request", message: "Expected { value }." });
      return;
    }
    appOverrides.set(app.id, parsed.data.value);
    const override = appOverrides.get(app.id);
    res.json({ ok: true, id: app.id, override: override ?? null, effective: override ?? app.packageName });
  });

  /**
   * What a display actually reports as installed -- title + exact launch URI.
   * Use it to find the correct value to paste into an app's launch target.
   */
  router.get("/devices/:hostname/installed-apps", async (req, res) => {
    const display = findDisplay(req.params.hostname);
    if (!display) {
      res.status(404).json({ error: "not_found", message: `No display registered with hostname "${req.params.hostname}".` });
      return;
    }
    try {
      const apps = await getApplicationList(display);
      res.json({ hostname: display.hostname, dryRun: display.dryRun, count: apps.length, apps });
    } catch (err) {
      const message = err instanceof BraviaError ? err.message : err instanceof Error ? err.message : String(err);
      res.status(502).json({ error: "display_error", message });
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

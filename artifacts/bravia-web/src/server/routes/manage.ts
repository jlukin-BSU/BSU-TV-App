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
import { CustomAppsStore, CustomAppsError } from "../lib/custom-apps";
import { isCustomApp } from "../lib/catalog-runtime";
import type { DashPinStore } from "../lib/dash-auth";
import { buildingsIn } from "../lib/building";
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

const AppTargetSchema = z
  .object({
    value: z.string().optional(),
    label: z.string().optional(),
    iconDataUrl: z.string().optional(),
  })
  .strict();

const NewAppSchema = z
  .object({
    label: z.string().min(1),
    launchValue: z.string().min(1),
    iconDataUrl: z.string().optional(),
  })
  .strict();

export function createManageRouter(
  config: AppConfig,
  store: SettingsStore,
  appOverrides: AppOverridesStore,
  customApps: CustomAppsStore,
  dashPins: DashPinStore,
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

  /** Every app -- built-in and custom -- with its launch target and icon. */
  router.get("/apps-config", (_req, res) => {
    const builtin = APPS.map((a) => {
      const override = appOverrides.get(a.id);
      return {
        id: a.id,
        label: a.label,
        custom: false,
        default: a.packageName,
        effective: override ?? a.packageName,
        override: override ?? null,
        icon: null as string | null,
      };
    });
    const custom = customApps.list().map((a) => ({
      id: a.id,
      label: a.label,
      custom: true,
      default: null,
      effective: a.launchValue,
      override: a.launchValue,
      icon: a.icon ? `/icons/${a.icon}` : null,
    }));
    res.json({ apps: [...builtin, ...custom] });
  });

  /** Add a custom app (label + launch value + optional icon). */
  router.post("/apps-config", (req, res) => {
    const parsed = NewAppSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "bad_request", message: "Expected { label, launchValue, iconDataUrl? }." });
      return;
    }
    try {
      const app = customApps.add(parsed.data);
      res.status(201).json({ ok: true, id: app.id, label: app.label });
    } catch (err) {
      respondError(res, err);
    }
  });

  /**
   * Edit an app. Built-in: sets/clears its launch override. Custom: updates its
   * launch value, label and/or icon.
   */
  router.put("/apps-config/:appId", (req, res) => {
    const parsed = AppTargetSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "bad_request", message: "Expected { value?, label?, iconDataUrl? }." });
      return;
    }
    const builtin = APPS.find((a) => a.id === req.params.appId);
    if (builtin) {
      appOverrides.set(builtin.id, parsed.data.value ?? "");
      const override = appOverrides.get(builtin.id);
      res.json({ ok: true, id: builtin.id, override: override ?? null, effective: override ?? builtin.packageName });
      return;
    }
    if (isCustomApp(req.params.appId)) {
      try {
        const app = customApps.update(req.params.appId, {
          launchValue: parsed.data.value,
          label: parsed.data.label,
          iconDataUrl: parsed.data.iconDataUrl,
        });
        res.json({ ok: true, id: app.id, effective: app.launchValue });
      } catch (err) {
        respondError(res, err);
      }
      return;
    }
    res.status(404).json({ error: "not_found", message: `Unknown app "${req.params.appId}".` });
  });

  /** Remove a custom app (built-in apps can't be deleted -- hide them per display). */
  router.delete("/apps-config/:appId", (req, res) => {
    if (APPS.some((a) => a.id === req.params.appId)) {
      res.status(400).json({ error: "builtin", message: "Built-in apps can't be removed; hide them per display instead." });
      return;
    }
    try {
      customApps.remove(req.params.appId);
      res.json({ ok: true });
    } catch (err) {
      respondError(res, err);
    }
  });

  /** Dashboard PINs: which buildings exist and which have a PIN + master set. */
  router.get("/dash-pins", (_req, res) => {
    const status = dashPins.status();
    res.json({ buildings: buildingsIn(config.displays), masterSet: status.masterSet, set: status.buildings });
  });

  /** Set (empty clears) the dashboard master PIN. */
  router.put("/dash-pins/master", (req, res) => {
    const pin = typeof req.body?.pin === "string" ? req.body.pin : "";
    dashPins.setMaster(pin);
    res.json({ ok: true });
  });

  /** Set (empty clears) a building's dashboard PIN. */
  router.put("/dash-pins/building/:code", (req, res) => {
    const pin = typeof req.body?.pin === "string" ? req.body.pin : "";
    dashPins.setBuilding(req.params.code, pin);
    res.json({ ok: true });
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
  if (err instanceof RegistryError || err instanceof CustomAppsError) {
    res.status(400).json({ error: "invalid", message: err.message });
    return;
  }
  logger.error({ err: String(err) }, "management error");
  res.status(500).json({ error: "internal", message: err instanceof Error ? err.message : String(err) });
}

export default createManageRouter;

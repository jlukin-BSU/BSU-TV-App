import { Router, type IRouter, type Request } from "express";
import { z } from "zod";
import type { AppConfig, Display } from "../lib/config";
import type { DashPinStore } from "../lib/dash-auth";
import type { AppOverridesStore } from "../lib/app-overrides";
import { buildingOf, buildingsIn, displaysInBuilding } from "../lib/building";
import { refresh, statesFor } from "../lib/dash-state";
import { INPUTS, findInput } from "../../shared/catalog";
import { findRuntimeApp, runtimeApps } from "../lib/catalog-runtime";
import {
  BraviaError,
  resolveAppUri,
  setActiveApp,
  setInput,
  setMute,
  setPower,
  setScreenState,
  setVolume,
  stepVolume,
} from "../lib/bravia";
import { logger } from "../lib/logger";

/**
 * Monitoring + control dashboard API. Access is by building: a request carries
 * the building's PIN in X-Dash-Pin, and may act only on displays in a building
 * that PIN opens (the master PIN opens all). Separate from the config planes.
 */

const LoginSchema = z.object({ building: z.string().optional(), pin: z.string() }).strict();
const ControlSchema = z.object({ hostname: z.string(), action: z.string(), value: z.string().optional() }).strict();

export function createDashboardRouter(
  config: AppConfig,
  pins: DashPinStore,
  appOverrides: AppOverridesStore,
): IRouter {
  const router: IRouter = Router();

  const pinOf = (req: Request): string => req.header("x-dash-pin") ?? "";
  const findDisplay = (hostname: string): Display | undefined =>
    config.displays.find((d) => d.hostname.trim().toLowerCase() === hostname.trim().toLowerCase());

  /** Validate a PIN for the master view or a specific building. */
  router.post("/login", (req, res) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "bad_request", message: "Expected { pin, building? }." });
      return;
    }
    const ok = parsed.data.building
      ? pins.checkBuilding(parsed.data.building, parsed.data.pin)
      : pins.checkMaster(parsed.data.pin);
    if (!ok) {
      res.status(401).json({ error: "unauthorized", message: "Incorrect PIN." });
      return;
    }
    res.json({ ok: true, master: pins.checkMaster(parsed.data.pin) });
  });

  /** State for one building (its PIN) or all buildings (master PIN). ?refresh=1 polls first. */
  router.get("/state", async (req, res) => {
    const building = typeof req.query["building"] === "string" ? req.query["building"] : "";
    const wantRefresh = req.query["refresh"] === "1";

    let displays: Display[];
    if (building) {
      if (!pins.checkBuilding(building, pinOf(req))) {
        res.status(401).json({ error: "unauthorized", message: "Incorrect PIN." });
        return;
      }
      displays = displaysInBuilding(config.displays, building);
    } else {
      if (!pins.checkMaster(pinOf(req))) {
        res.status(401).json({ error: "unauthorized", message: "Incorrect PIN." });
        return;
      }
      displays = config.displays;
    }

    if (wantRefresh) {
      try {
        await refresh(displays);
      } catch (err) {
        logger.warn({ err: String(err) }, "on-demand dashboard refresh failed");
      }
    }
    res.json({
      building: building || null,
      buildings: buildingsIn(config.displays),
      displays: statesFor(displays),
      // Source options for the per-display "change source" selector.
      options: {
        inputs: INPUTS.map((i) => ({ id: i.id, label: i.label })),
        apps: runtimeApps().map((a) => ({ id: a.id, label: a.label })),
      },
    });
  });

  /** Issue a control command to one display (PIN must open that display's building). */
  router.post("/control", async (req, res) => {
    const parsed = ControlSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "bad_request", message: "Expected { hostname, action, value? }." });
      return;
    }
    const display = findDisplay(parsed.data.hostname);
    if (!display) {
      res.status(404).json({ error: "not_found", message: "Unknown display." });
      return;
    }
    if (!pins.checkBuilding(buildingOf(display.hostname), pinOf(req))) {
      res.status(401).json({ error: "unauthorized", message: "Incorrect PIN for this building." });
      return;
    }

    try {
      await runAction(display, parsed.data.action, parsed.data.value, appOverrides);
      // Reflect the change quickly.
      await refresh([display]).catch(() => undefined);
      res.json({ ok: true, state: statesFor([display])[0] });
    } catch (err) {
      const message = err instanceof BraviaError ? err.message : err instanceof Error ? err.message : String(err);
      res.status(502).json({ error: "display_error", message });
    }
  });

  return router;
}

async function runAction(display: Display, action: string, value: string | undefined, appOverrides: AppOverridesStore): Promise<void> {
  switch (action) {
    case "power":
      await setPower(display, value === "on");
      return;
    case "volup":
      await stepVolume(display, 1);
      return;
    case "voldown":
      await stepVolume(display, -1);
      return;
    case "volume":
      await setVolume(display, Number(value ?? "0"));
      return;
    case "mute":
      await setMute(display, value !== "off");
      return;
    case "screenoff":
      await setScreenState(display, "pictureOff");
      return;
    case "screenon":
      await setScreenState(display, "pictureOn");
      return;
    case "input": {
      const input = findInput(value ?? "");
      if (!input) throw new BraviaError(`Unknown input "${value}".`);
      await setInput(display, input.port);
      return;
    }
    case "app": {
      const app = findRuntimeApp(value ?? "");
      if (!app) throw new BraviaError(`Unknown app "${value}".`);
      const launch = appOverrides.get(app.id) ?? app.packageName;
      const uri = await resolveAppUri(display, launch);
      await setActiveApp(display, uri);
      return;
    }
    default:
      throw new BraviaError(`Unknown action "${action}".`);
  }
}

export default createDashboardRouter;

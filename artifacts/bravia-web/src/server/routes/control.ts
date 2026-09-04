import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  INPUTS,
  findApp,
  findCommand,
  findInput,
  type ClientConfig,
} from "../../shared/catalog";
import {
  BraviaError,
  getApplicationList,
  resolveAppUri,
  setActiveApp,
  setInput,
  setScreenState,
} from "../lib/bravia";
import { requireDisplay } from "../middlewares/device";
import { effectiveConfig, type SettingsStore } from "../lib/settings";
import { logger } from "../lib/logger";

const InputRequest = z.object({ inputId: z.string().min(1) }).strict();
const AppRequest = z.object({ appId: z.string().min(1) }).strict();
const CommandRequest = z.object({ commandId: z.string().min(1) }).strict();

function errorPayload(err: unknown): { error: string; message: string } {
  if (err instanceof BraviaError) return { error: "display_error", message: err.message };
  return {
    error: "internal_error",
    message: err instanceof Error ? err.message : String(err),
  };
}

export function createControlRouter(store: SettingsStore): IRouter {
  const router: IRouter = Router();

  /** Who am I, and which tiles should I show? Derived from source IP + admin edits. */
  router.get("/config", (req, res) => {
    const display = requireDisplay(req);
    const eff = effectiveConfig(display, store.get(display.hostname));

    const payload: ClientConfig = {
      device: {
        hostname: display.hostname,
        label: display.label,
        ip: display.ip,
        dryRun: display.dryRun,
      },
      tiles: eff.tiles,
      inputs: INPUTS.filter((i) => eff.inputIds.includes(i.id)).map((i) => ({ ...i })),
      autoSignage: eff.settings.autoSignage,
      idleMs: eff.settings.idleSeconds * 1000,
    };

    res.json(payload);
  });

  /** Switch HDMI input. */
  router.post("/input", async (req, res) => {
    const display = requireDisplay(req);
    const parsed = InputRequest.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "bad_request", message: "Expected { inputId }." });
      return;
    }

    const eff = effectiveConfig(display, store.get(display.hostname));
    const entry = findInput(parsed.data.inputId);
    if (!entry || !eff.inputIds.includes(entry.id)) {
      res.status(400).json({
        error: "unknown_input",
        message: `"${parsed.data.inputId}" is not an input available on ${display.hostname}.`,
      });
      return;
    }

    try {
      await setInput(display, entry.port);
      logger.info({ display: display.hostname, input: entry.id, port: entry.port }, "Switched input");
      res.json({ ok: true, input: entry.id, label: entry.label });
    } catch (err) {
      logger.warn({ display: display.hostname, input: entry.id, err }, "Input switch failed");
      res.status(502).json(errorPayload(err));
    }
  });

  /** Launch an installed Android app. */
  router.post("/app", async (req, res) => {
    const display = requireDisplay(req);
    const parsed = AppRequest.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "bad_request", message: "Expected { appId }." });
      return;
    }

    const eff = effectiveConfig(display, store.get(display.hostname));
    const entry = findApp(parsed.data.appId);
    if (!entry || !eff.appIds.includes(entry.id)) {
      res.status(400).json({
        error: "unknown_app",
        message: `"${parsed.data.appId}" is not an app available on ${display.hostname}.`,
      });
      return;
    }

    try {
      const uri = await resolveAppUri(display, entry.packageName);
      await setActiveApp(display, uri);
      logger.info(
        { display: display.hostname, app: entry.id, package: entry.packageName, uri },
        "Launched app",
      );
      res.json({ ok: true, app: entry.id, label: entry.label, uri });
    } catch (err) {
      logger.warn({ display: display.hostname, app: entry.id, err }, "App launch failed");
      res.status(502).json(errorPayload(err));
    }
  });

  /** Screen off / screen on / power off. */
  router.post("/command", async (req, res) => {
    const display = requireDisplay(req);
    const parsed = CommandRequest.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "bad_request", message: "Expected { commandId }." });
      return;
    }

    const eff = effectiveConfig(display, store.get(display.hostname));
    const entry = findCommand(parsed.data.commandId);
    // "screenon" is the wake counterpart of "screenoff": whenever a display can be
    // blanked it must be able to be woken, even if Screen On is not a visible tile.
    const allowed =
      entry &&
      (eff.commandIds.includes(entry.id) ||
        (entry.id === "screenon" && eff.commandIds.includes("screenoff")));
    if (!entry || !allowed) {
      res.status(400).json({
        error: "unknown_command",
        message: `"${parsed.data.commandId}" is not a command available on ${display.hostname}.`,
      });
      return;
    }

    try {
      await setScreenState(display, entry.kind);
      logger.info({ display: display.hostname, command: entry.id, kind: entry.kind }, "Sent screen command");
      res.json({ ok: true, command: entry.id, label: entry.label });
    } catch (err) {
      logger.warn({ display: display.hostname, command: entry.id, err }, "Screen command failed");
      res.status(502).json(errorPayload(err));
    }
  });

  /** Diagnostic: what the display actually reports as installed. */
  router.get("/apps", async (req, res) => {
    const display = requireDisplay(req);
    try {
      const apps = await getApplicationList(display);
      res.json({ display: display.hostname, count: apps.length, apps });
    } catch (err) {
      res.status(502).json(errorPayload(err));
    }
  });

  return router;
}

export default createControlRouter;

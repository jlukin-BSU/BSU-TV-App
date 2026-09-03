import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  APPS,
  COMMANDS,
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
import { logger } from "../lib/logger";

const router: IRouter = Router();

const InputRequest = z.object({ inputId: z.string().min(1) }).strict();
const AppRequest = z.object({ appId: z.string().min(1) }).strict();
const CommandRequest = z.object({ commandId: z.string().min(1) }).strict();

/** Turn any thrown value into a client-safe payload. */
function errorPayload(err: unknown): { error: string; message: string } {
  if (err instanceof BraviaError) {
    return { error: "display_error", message: err.message };
  }
  return {
    error: "internal_error",
    message: err instanceof Error ? err.message : String(err),
  };
}

/**
 * Who am I, and which buttons should I show?
 *
 * The UI has no idea which display it is running on -- it asks, and the answer
 * is derived from the source IP. Nothing identifying is ever sent by the client.
 */
router.get("/config", (req, res) => {
  const display = requireDisplay(req);

  const payload: ClientConfig = {
    device: {
      hostname: display.hostname,
      label: display.label,
      ip: display.ip,
      dryRun: display.dryRun,
    },
    inputs: INPUTS.filter((i) => display.inputs.includes(i.id)).map((i) => ({ ...i })),
    apps: APPS.filter((a) => display.apps.includes(a.id)).map((a) => ({
      id: a.id,
      label: a.label,
    })),
    commands: COMMANDS.filter((c) => display.commands.includes(c.id)).map((c) => ({
      id: c.id,
      label: c.label,
    })),
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

  const entry = findInput(parsed.data.inputId);
  if (!entry || !display.inputs.includes(entry.id)) {
    res.status(400).json({
      error: "unknown_input",
      message: `"${parsed.data.inputId}" is not an input available on ${display.hostname}.`,
    });
    return;
  }

  try {
    await setInput(display, entry.port);
    logger.info(
      { display: display.hostname, input: entry.id, port: entry.port },
      "Switched input",
    );
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

  const entry = findApp(parsed.data.appId);
  if (!entry || !display.apps.includes(entry.id)) {
    res.status(400).json({
      error: "unknown_app",
      message: `"${parsed.data.appId}" is not an app available on ${display.hostname}.`,
    });
    return;
  }

  try {
    // Package name -> display-reported URI, then launch.
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

  const entry = findCommand(parsed.data.commandId);
  // "screenon" is the wake counterpart of "screenoff": whenever a display can be
  // blanked it must be able to be woken, even if Screen On is not a visible tile.
  const allowed =
    entry &&
    (display.commands.includes(entry.id) ||
      (entry.id === "screenon" && display.commands.includes("screenoff")));
  if (!entry || !allowed) {
    res.status(400).json({
      error: "unknown_command",
      message: `"${parsed.data.commandId}" is not a command available on ${display.hostname}.`,
    });
    return;
  }

  try {
    await setScreenState(display, entry.kind);
    logger.info(
      { display: display.hostname, command: entry.id, kind: entry.kind },
      "Sent screen command",
    );
    res.json({ ok: true, command: entry.id, label: entry.label });
  } catch (err) {
    logger.warn({ display: display.hostname, command: entry.id, err }, "Screen command failed");
    res.status(502).json(errorPayload(err));
  }
});

/**
 * Diagnostic: what the display actually reports as installed.
 * Use this to fill in package names when adding a new app to the catalog.
 */
router.get("/apps", async (req, res) => {
  const display = requireDisplay(req);
  try {
    const apps = await getApplicationList(display);
    res.json({ display: display.hostname, count: apps.length, apps });
  } catch (err) {
    res.status(502).json(errorPayload(err));
  }
});

export default router;

import { Router, type IRouter } from "express";
import { requireDisplay } from "../middlewares/device";
import {
  SettingsSaveSchema,
  saveSettingsFor,
  settingsViewFor,
  type SettingsStore,
} from "../lib/settings";
import {
  PresentationError,
  pickPresentationPatch,
  presentationStore,
  presentationViewFor,
} from "../lib/presentation";
import { logger } from "../lib/logger";

/**
 * Admin API. Edits the CALLING display's settings (the display is resolved from
 * the source IP upstream), stored server-side.
 *
 * No password: these routes sit behind the same source-IP check as everything
 * else, so only a registered display can reach them, and the panel is launched
 * by a hidden gesture. On a controlled AV VLAN that network position is the auth
 * -- configuring is deliberately obscure, not credentialed. The same settings
 * can also be edited from the management page (by hostname, behind the PIN).
 */
export function createAdminRouter(store: SettingsStore): IRouter {
  const router: IRouter = Router();

  /** Current editable settings for the calling display. */
  router.get("/settings", (req, res) => {
    const display = requireDisplay(req);
    res.json({
      device: { hostname: display.hostname, label: display.label },
      ...settingsViewFor(display, store),
      ...presentationViewFor(presentationStore(), display.hostname),
    });
  });

  /** Save settings for the calling display. */
  router.put("/settings", (req, res) => {
    const display = requireDisplay(req);
    const parsed = SettingsSaveSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "bad_request", message: "Expected { enabled, order, autoSignage, idleSeconds, layout? }." });
      return;
    }
    const presentation = presentationStore();
    try {
      // Presentation first: it is the part that can still be rejected (bad URL),
      // and a rejection must not leave the tile settings half-saved.
      presentation.update(display.hostname, pickPresentationPatch(parsed.data));
    } catch (err) {
      if (err instanceof PresentationError) {
        res.status(400).json({ error: "bad_request", message: err.message });
        return;
      }
      throw err;
    }
    const view = saveSettingsFor(display, store, parsed.data);
    logger.info({ display: display.hostname }, "admin saved display settings");
    res.json({ ok: true, ...view, ...presentationViewFor(presentation, display.hostname) });
  });

  return router;
}

export default createAdminRouter;

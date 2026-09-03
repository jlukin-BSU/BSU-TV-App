import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { TILES, findTile } from "../../shared/catalog";
import { requireDisplay } from "../middlewares/device";
import {
  adminEnabled,
  checkAdminPassword,
  effectiveConfig,
  type SettingsStore,
} from "../lib/settings";
import { logger } from "../lib/logger";

/**
 * Admin API. Edits the CALLING display's settings (the display is resolved from
 * the source IP upstream), stored server-side. Guarded by a shared admin
 * password sent in the X-Admin-Password header and checked in constant time.
 *
 * The whole surface sits on the controlled AV VLAN behind HTTPS, so a single
 * shared password is the right weight here -- no per-user accounts.
 */

const SaveRequest = z
  .object({
    enabled: z.record(z.string(), z.boolean()),
    order: z.array(z.string()),
    autoSignage: z.boolean(),
  })
  .strict();

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!adminEnabled()) {
    res.status(503).json({
      error: "admin_disabled",
      message: "No admin password is configured (set ADMIN_PASSWORD).",
    });
    return;
  }
  const supplied = req.header("x-admin-password") ?? "";
  if (!checkAdminPassword(supplied)) {
    res.status(401).json({ error: "unauthorized", message: "Incorrect admin password." });
    return;
  }
  next();
}

export function createAdminRouter(store: SettingsStore): IRouter {
  const router: IRouter = Router();

  router.use(requireAdmin);

  /** Current editable settings for the calling display. */
  router.get("/settings", (req, res) => {
    const display = requireDisplay(req);
    const eff = effectiveConfig(display, store.get(display.hostname));

    res.json({
      device: { hostname: display.hostname, label: display.label },
      autoSignage: eff.settings.autoSignage,
      // Every tile, in order, with its current enabled state -- so hidden tiles
      // can be turned back on.
      tiles: eff.settings.order
        .map((key) => findTile(key))
        .filter((t): t is NonNullable<typeof t> => !!t)
        .map((t) => ({
          key: t.key,
          kind: t.kind,
          label: t.label,
          enabled: eff.settings.enabled[t.key] === true,
        })),
    });
  });

  /** Save settings for the calling display. */
  router.put("/settings", (req, res) => {
    const display = requireDisplay(req);
    const parsed = SaveRequest.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "bad_request",
        message: "Expected { enabled, order, autoSignage }.",
      });
      return;
    }

    // Drop any unknown tile keys rather than persisting junk.
    const enabled: Record<string, boolean> = {};
    for (const tile of TILES) {
      if (tile.key in parsed.data.enabled) enabled[tile.key] = parsed.data.enabled[tile.key]!;
    }
    const order = parsed.data.order.filter((k) => findTile(k));

    store.set(display.hostname, { enabled, order, autoSignage: parsed.data.autoSignage });
    logger.info({ display: display.hostname }, "admin saved display settings");

    const eff = effectiveConfig(display, store.get(display.hostname));
    res.json({ ok: true, tiles: eff.tiles, autoSignage: eff.settings.autoSignage });
  });

  return router;
}

export default createAdminRouter;

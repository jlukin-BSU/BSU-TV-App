import { Router, type IRouter } from "express";
import { z } from "zod";
import { TILES, findTile } from "../../shared/catalog";
import { requireDisplay } from "../middlewares/device";
import { effectiveConfig, type SettingsStore } from "../lib/settings";
import { logger } from "../lib/logger";

/**
 * Admin API. Edits the CALLING display's settings (the display is resolved from
 * the source IP upstream), stored server-side.
 *
 * No password: these routes sit behind the same source-IP check as everything
 * else, so only a registered display can reach them, and the panel is launched
 * by a hidden gesture. On a controlled AV VLAN that network position is the auth
 * -- configuring is deliberately obscure, not credentialed.
 */

const SaveRequest = z
  .object({
    enabled: z.record(z.string(), z.boolean()),
    order: z.array(z.string()),
    autoSignage: z.boolean(),
    idleSeconds: z.number(),
  })
  .strict();

export function createAdminRouter(store: SettingsStore): IRouter {
  const router: IRouter = Router();

  /** Current editable settings for the calling display. */
  router.get("/settings", (req, res) => {
    const display = requireDisplay(req);
    const eff = effectiveConfig(display, store.get(display.hostname));

    res.json({
      device: { hostname: display.hostname, label: display.label },
      autoSignage: eff.settings.autoSignage,
      idleSeconds: eff.settings.idleSeconds,
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

    store.set(display.hostname, {
      enabled,
      order,
      autoSignage: parsed.data.autoSignage,
      idleSeconds: parsed.data.idleSeconds,
    });
    logger.info({ display: display.hostname }, "admin saved display settings");

    const eff = effectiveConfig(display, store.get(display.hostname));
    res.json({ ok: true, tiles: eff.tiles, autoSignage: eff.settings.autoSignage });
  });

  return router;
}

export default createAdminRouter;

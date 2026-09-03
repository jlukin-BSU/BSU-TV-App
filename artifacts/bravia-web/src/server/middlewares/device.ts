import type { NextFunction, Request, Response } from "express";
import type { AppConfig, Display } from "../lib/config";
import { normalizeIp } from "../lib/ip";
import { logger } from "../lib/logger";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** The display that made this request, resolved from its source IP. */
      display?: Display;
      /** Normalised source IP used for the lookup. */
      sourceIp?: string;
    }
  }
}

/**
 * Identify the calling display by the request's source IP address.
 *
 * This is the whole authorization model: the source IP selects which display
 * gets commanded and which PSK is used. Two things therefore matter a lot.
 *
 * 1. `req.ip` must be the display's real address. Behind nginx the socket peer
 *    is 127.0.0.1, so `trust proxy` is set to `loopback` in app.ts and nginx is
 *    configured to *overwrite* (not append to) X-Forwarded-For. That
 *    combination means a display cannot spoof its identity by sending its own
 *    X-Forwarded-For header -- nginx replaces whatever arrived.
 *
 * 2. An unknown IP is refused outright. There is no fallback display and no way
 *    for the caller to name one, so a machine that is not in devices.json
 *    simply cannot drive anything.
 */
export function resolveDevice(config: AppConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const sourceIp = normalizeIp(req.ip ?? "");
    req.sourceIp = sourceIp;

    const display = config.byIp.get(sourceIp);
    if (!display) {
      logger.warn(
        { sourceIp, path: req.path },
        "Request from an IP that is not in the device config",
      );
      res.status(403).json({
        error: "unknown_display",
        message: `This device (${sourceIp || "unknown address"}) is not registered. Add it to devices.json with its IP, hostname and PSK.`,
        sourceIp,
      });
      return;
    }

    req.display = display;
    next();
  };
}

/**
 * Narrow `req.display` for handlers mounted behind `resolveDevice`.
 * Throws rather than returning a response: reaching here without a display
 * means the middleware chain was wired wrong, which is a bug, not a bad request.
 */
export function requireDisplay(req: Request): Display {
  if (!req.display) {
    throw new Error(
      "requireDisplay() called on a route that is not behind resolveDevice()",
    );
  }
  return req.display;
}

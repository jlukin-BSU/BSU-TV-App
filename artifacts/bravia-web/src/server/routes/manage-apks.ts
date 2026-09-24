import fs from "node:fs";
import crypto from "node:crypto";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { checkMgmtPin } from "../lib/mgmt";
import { ApkStoreError, labelFor, type ApkStore } from "../lib/apk-store";
import { statusFor, type StreamerRegistry } from "../lib/streamer-registry";
import { logger } from "../lib/logger";

/**
 * Management API for the streamer app store: upload APKs, see which streamers
 * have them. Same PIN as the rest of the management page.
 *
 * Kept out of routes/manage.ts deliberately. Uploads are raw binary streams,
 * not the JSON that router is built around, and keeping it separate means this
 * feature does not touch the device-registry code at all.
 */

/** Larger than any plausible APK, small enough that a runaway upload can't fill the disk. */
const MAX_APK_BYTES = 500 * 1024 * 1024;

/** A streamer that reports every 30 minutes is considered offline after this long silent. */
const ONLINE_WINDOW_MS = 75 * 60 * 1000;

function requirePin(req: Request, res: Response, next: NextFunction): void {
  if (!checkMgmtPin(req.header("x-manage-pin") ?? "")) {
    res.status(401).json({ error: "unauthorized", message: "Incorrect PIN." });
    return;
  }
  next();
}

export function createManageApksRouter(apks: ApkStore, streamers: StreamerRegistry): IRouter {
  const router: IRouter = Router();

  router.get("/apks", requirePin, (_req, res) => {
    res.json({
      apks: apks.list().map((a) => ({ ...a, label: labelFor(a.packageName) })),
    });
  });

  /**
   * Raw APK upload. Streamed to disk and hashed on the way through, so a large
   * file never sits in memory and the checksum is of exactly the bytes stored.
   */
  router.post("/apks", requirePin, async (req, res) => {
    const tmp = apks.tempPath();
    const hash = crypto.createHash("sha256");
    let size = 0;

    const meter = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        size += chunk.length;
        if (size > MAX_APK_BYTES) {
          cb(new ApkStoreError(`Upload exceeds ${MAX_APK_BYTES / 1024 / 1024} MB.`));
          return;
        }
        hash.update(chunk);
        cb(null, chunk);
      },
    });

    try {
      await pipeline(req, meter, fs.createWriteStream(tmp));
      if (size === 0) throw new ApkStoreError("The upload was empty.");
      const entry = apks.ingest(tmp, hash.digest("hex"), size);
      res.json({ ok: true, apk: { ...entry, label: labelFor(entry.packageName) } });
    } catch (err) {
      fs.rmSync(tmp, { force: true });
      if (err instanceof ApkStoreError) {
        res.status(400).json({ error: "bad_apk", message: err.message });
        return;
      }
      logger.error({ err: String(err) }, "APK upload failed");
      res.status(500).json({ error: "upload_failed", message: "The upload could not be saved." });
    }
  });

  router.delete("/apks/:packageName", requirePin, (req, res) => {
    if (!apks.remove(String(req.params.packageName))) {
      res.status(404).json({ error: "not_found", message: "No such app in the store." });
      return;
    }
    res.json({ ok: true });
  });

  router.get("/streamers", requirePin, (_req, res) => {
    const now = Date.now();
    const stored = apks.list();
    res.json({
      streamers: streamers.list().map((s) => ({
        deviceId: s.deviceId,
        model: s.model,
        manufacturer: s.manufacturer,
        androidRelease: s.androidRelease,
        appVersion: s.appVersion,
        ip: s.sourceIp,
        deviceOwner: s.deviceOwner,
        lastSeen: s.lastSeen,
        online: now - Date.parse(s.lastSeen) < ONLINE_WINDOW_MS,
        lastInstall: s.lastInstall,
        apps: statusFor(s, stored),
      })),
    });
  });

  router.delete("/streamers/:deviceId", requirePin, (req, res) => {
    if (!streamers.remove(String(req.params.deviceId))) {
      res.status(404).json({ error: "not_found", message: "No such streamer." });
      return;
    }
    res.json({ ok: true });
  });

  return router;
}

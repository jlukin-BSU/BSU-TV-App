import { Router, type IRouter } from "express";
import type { ApkStore } from "../lib/apk-store";
import { StreamerReportSchema, statusFor, type StreamerRegistry } from "../lib/streamer-registry";
import { normalizeIp } from "../lib/ip";

/**
 * Endpoints the streaming devices call, on the control port.
 *
 * Mounted ahead of resolveDevice: a streamer is not a registered display, so it
 * would be turned away there. Nothing here can command a display -- it is a
 * manifest, the APK files it points at, and a status report.
 *
 *   GET  /streamer/manifest       what should be installed, with checksums
 *   GET  /streamer/apk/:sha256    the file itself, addressed by its hash
 *   POST /streamer/register       "this is what I have installed"
 */
export function createStreamerRouter(apks: ApkStore, streamers: StreamerRegistry): IRouter {
  const router: IRouter = Router();

  router.get("/streamer/manifest", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.json({
      apps: apks.list().map((a) => ({
        packageName: a.packageName,
        versionCode: a.versionCode,
        versionName: a.versionName,
        sha256: a.sha256,
        size: a.size,
        url: `/api/streamer/apk/${a.sha256}`,
      })),
    });
  });

  router.get("/streamer/apk/:sha256", (req, res) => {
    const sha = req.params.sha256.toLowerCase();
    // Only serve hashes the store knows -- never let the path reach the filesystem unchecked.
    if (!/^[0-9a-f]{64}$/.test(sha) || !apks.bySha(sha)) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.setHeader("Content-Type", "application/vnd.android.package-archive");
    // Content-addressed, so a given URL's bytes never change.
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.sendFile(apks.filePath(sha));
  });

  router.post("/streamer/register", (req, res) => {
    const parsed = StreamerReportSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "bad_request", message: parsed.error.issues[0]?.message ?? "Invalid report." });
      return;
    }
    const rec = streamers.record(parsed.data, normalizeIp(req.ip ?? ""));
    // Echo the verdict so the device (and anyone debugging it) sees the same view as the dashboard.
    res.json({ ok: true, apps: statusFor(rec, apks.list()) });
  });

  return router;
}

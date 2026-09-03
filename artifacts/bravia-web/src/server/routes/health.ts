import { Router, type IRouter } from "express";

const router: IRouter = Router();

/**
 * Open health check -- deliberately not behind device resolution, so it can be
 * curled from the NUC itself and used by systemd/nginx checks.
 */
router.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

export default router;

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { z } from "zod";
import { resolveConfigPath } from "./config";
import { logger } from "./logger";

/**
 * PINs for the monitoring dashboard: one per building (a building manager's
 * access to just their space) plus an optional master PIN (all buildings). Set
 * from the management page. Constant-time comparison; the master PIN also opens
 * any building.
 */

const StoreSchema = z.object({
  master: z.string().nullable().default(null),
  buildings: z.record(z.string(), z.string()).default({}),
});

export type DashPins = z.infer<typeof StoreSchema>;

export function resolveDashPinsPath(): string {
  const fromEnv = process.env["DASH_PINS"];
  if (fromEnv && fromEnv.trim() !== "") return path.resolve(fromEnv.trim());
  return path.join(path.dirname(resolveConfigPath()), "dash-pins.json");
}

function timingEqual(a: string, b: string): boolean {
  if (a === "" || b === "") return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export class DashPinStore {
  private data: DashPins;

  constructor(private readonly filePath: string) {
    this.data = DashPinStore.read(filePath);
  }

  private static read(filePath: string): DashPins {
    try {
      const parsed = StoreSchema.safeParse(JSON.parse(fs.readFileSync(filePath, "utf8")));
      if (parsed.success) return parsed.data;
    } catch {
      /* first run */
    }
    return { master: null, buildings: {} };
  }

  private persist(): void {
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), "utf8");
    fs.renameSync(tmp, this.filePath);
  }

  /** For the management view: which buildings have a PIN set, and if master is set. */
  status(): { masterSet: boolean; buildings: Record<string, boolean> } {
    const buildings: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(this.data.buildings)) buildings[k] = v.trim() !== "";
    return { masterSet: (this.data.master ?? "").trim() !== "", buildings };
  }

  setMaster(pin: string): void {
    this.data.master = pin.trim() === "" ? null : pin.trim();
    this.persist();
    logger.info("dashboard master PIN updated");
  }

  setBuilding(code: string, pin: string): void {
    const key = code.trim().toUpperCase();
    if (pin.trim() === "") delete this.data.buildings[key];
    else this.data.buildings[key] = pin.trim();
    this.persist();
    logger.info({ building: key }, "dashboard building PIN updated");
  }

  /** True if the PIN opens the master (all-buildings) view. */
  checkMaster(pin: string): boolean {
    return timingEqual(pin, this.data.master ?? "");
  }

  /** True if the PIN opens this building (its own PIN, or the master PIN). */
  checkBuilding(code: string, pin: string): boolean {
    const key = code.trim().toUpperCase();
    return timingEqual(pin, this.data.buildings[key] ?? "") || this.checkMaster(pin);
  }
}

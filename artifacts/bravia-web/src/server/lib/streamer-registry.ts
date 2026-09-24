import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { resolveConfigPath } from "./config";
import { labelFor, type StoredApk } from "./apk-store";
import { logger } from "./logger";

/**
 * What each streaming device last reported about itself.
 *
 * Streamers announce themselves -- they sit on a different VLAN from the server,
 * so nothing here can discover them -- and include the version of every managed
 * app they have installed. That report is how installation is *verified*: the
 * server never assumes an install worked, it waits for the device to say so.
 *
 * Reports are accepted from any caller on the control port, because streamers
 * are not registered displays yet. Until the systems schema ties a streamer to
 * a known hostname, a report can populate this list but cannot command anything.
 */

const InstalledSchema = z.record(
  z.string().min(1).max(255),
  z.object({
    versionCode: z.number().int().nonnegative(),
    versionName: z.string().max(100).nullable(),
  }),
);

export const StreamerReportSchema = z
  .object({
    deviceId: z.string().min(1).max(128),
    model: z.string().max(100).default(""),
    manufacturer: z.string().max(100).default(""),
    device: z.string().max(100).default(""),
    androidRelease: z.string().max(20).default(""),
    sdkInt: z.number().int().default(0),
    appVersion: z.string().max(50).default(""),
    ip: z.string().max(64).nullable().default(null),
    /** True when the shell holds Device Owner, i.e. can install silently. */
    deviceOwner: z.boolean().default(false),
    installed: InstalledSchema.default({}),
    /** Last install attempt the shell made, for diagnosing failed updates. */
    lastInstall: z
      .object({
        packageName: z.string().max(255),
        ok: z.boolean(),
        message: z.string().max(500).nullable(),
      })
      .nullable()
      .default(null),
  })
  .strict();

export type StreamerReport = z.infer<typeof StreamerReportSchema>;

export interface StreamerRecord extends StreamerReport {
  /** Address the report actually came from, which the device cannot forge. */
  sourceIp: string;
  lastSeen: string;
}

export type AppState = "current" | "outdated" | "missing" | "ahead";

export interface AppStatus {
  packageName: string;
  label: string;
  wanted: { versionCode: number; versionName: string | null };
  installed: { versionCode: number; versionName: string | null } | null;
  state: AppState;
}

/** Compare what a streamer has against what the store says it should have. */
export function statusFor(record: Pick<StreamerRecord, "installed">, apks: StoredApk[]): AppStatus[] {
  return apks.map((apk) => {
    const have = record.installed[apk.packageName] ?? null;
    let state: AppState;
    if (!have) state = "missing";
    else if (have.versionCode < apk.versionCode) state = "outdated";
    else if (have.versionCode > apk.versionCode) state = "ahead";
    else state = "current";
    return {
      packageName: apk.packageName,
      label: labelFor(apk.packageName),
      wanted: { versionCode: apk.versionCode, versionName: apk.versionName },
      installed: have,
      state,
    };
  });
}

/** Keeps a stray or hostile caller from growing the file without bound. */
const MAX_STREAMERS = 500;

export function resolveStreamersPath(): string {
  const fromEnv = process.env["STREAMERS_STATE"];
  if (fromEnv && fromEnv.trim() !== "") return path.resolve(fromEnv.trim());
  return path.join(path.dirname(resolveConfigPath()), "streamers.json");
}

export class StreamerRegistry {
  private records = new Map<string, StreamerRecord>();

  constructor(private readonly filePath: string) {
    this.load();
  }

  private load(): void {
    try {
      const raw = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as StreamerRecord[];
      for (const r of raw) if (r && typeof r.deviceId === "string") this.records.set(r.deviceId, r);
    } catch {
      // No file yet, or unreadable: start empty. Streamers re-report on boot.
    }
  }

  private save(): void {
    try {
      const tmp = `${this.filePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify([...this.records.values()], null, 2));
      fs.renameSync(tmp, this.filePath);
    } catch (err) {
      // Status is advisory; losing it on a write failure is not worth crashing for.
      logger.warn({ err: String(err) }, "could not persist streamer state");
    }
  }

  record(report: StreamerReport, sourceIp: string): StreamerRecord {
    if (!this.records.has(report.deviceId) && this.records.size >= MAX_STREAMERS) {
      // Evict the longest-silent device rather than refusing a real one.
      const oldest = [...this.records.values()].sort((a, b) => a.lastSeen.localeCompare(b.lastSeen))[0];
      if (oldest) this.records.delete(oldest.deviceId);
    }
    const rec: StreamerRecord = { ...report, sourceIp, lastSeen: new Date().toISOString() };
    this.records.set(report.deviceId, rec);
    this.save();
    return rec;
  }

  list(): StreamerRecord[] {
    return [...this.records.values()].sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
  }

  remove(deviceId: string): boolean {
    const had = this.records.delete(deviceId);
    if (had) this.save();
    return had;
  }
}

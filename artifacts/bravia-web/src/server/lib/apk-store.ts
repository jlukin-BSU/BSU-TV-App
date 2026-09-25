import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { resolveConfigPath } from "./config";
import { readApkInfo, ApkError } from "./apk-info";
import { logger } from "./logger";

/**
 * APKs the streamers should have installed, one current build per package.
 *
 * Runtime data, like devices.json and the icon store: it lives next to the
 * device config (/etc/bravia-web on the NUC), never in git. The APKs are
 * third-party binaries in OptiSigns' case, and tens of megabytes each.
 *
 * Files are stored under their SHA-256, which doubles as the download URL and
 * the integrity check the streamer verifies before installing.
 */

export const SHELL_PACKAGE = "edu.bridgew.tvkiosk";

/** Friendly names for the packages we manage; anything else shows its package name. */
const KNOWN_LABELS: Record<string, string> = {
  [SHELL_PACKAGE]: "BSU TV",
  "com.optisigns.playe1": "OptiSigns",
  "com.Swank.SwankMediaPlayer": "ResNet Cinema",
};

export function labelFor(packageName: string): string {
  return KNOWN_LABELS[packageName] ?? packageName;
}

const StoredApkSchema = z.object({
  packageName: z.string().min(1),
  versionCode: z.number().int().nonnegative(),
  versionName: z.string().nullable(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  size: z.number().int().nonnegative(),
  uploadedAt: z.string(),
});
const IndexSchema = z.array(StoredApkSchema);

export type StoredApk = z.infer<typeof StoredApkSchema>;

export class ApkStoreError extends Error {}

export function resolveApksDir(): string {
  const fromEnv = process.env["APKS_DIR"];
  if (fromEnv && fromEnv.trim() !== "") return path.resolve(fromEnv.trim());
  return path.join(path.dirname(resolveConfigPath()), "apks");
}

export class ApkStore {
  private entries: StoredApk[] = [];

  constructor(readonly dir: string) {
    fs.mkdirSync(dir, { recursive: true });
    this.load();
  }

  private get indexPath(): string {
    return path.join(this.dir, "index.json");
  }

  private load(): void {
    try {
      const parsed = IndexSchema.safeParse(JSON.parse(fs.readFileSync(this.indexPath, "utf8")));
      if (!parsed.success) {
        logger.warn({ path: this.indexPath }, "APK index is invalid; starting empty");
        return;
      }
      // Drop entries whose file has gone missing rather than advertising them.
      this.entries = parsed.data.filter((e) => fs.existsSync(this.filePath(e.sha256)));
    } catch {
      this.entries = [];
    }
  }

  private save(): void {
    const tmp = `${this.indexPath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.entries, null, 2));
    fs.renameSync(tmp, this.indexPath);
  }

  filePath(sha256: string): string {
    return path.join(this.dir, `${sha256}.apk`);
  }

  /** A fresh path in the store directory for an in-progress upload. */
  tempPath(): string {
    return path.join(this.dir, `.upload-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`);
  }

  list(): StoredApk[] {
    return [...this.entries].sort((a, b) => labelFor(a.packageName).localeCompare(labelFor(b.packageName)));
  }

  bySha(sha256: string): StoredApk | undefined {
    return this.entries.find((e) => e.sha256 === sha256);
  }

  /**
   * Adopt an uploaded file (already written to `tempFile` and hashed).
   *
   * Refuses a lower versionCode than the one stored: Android will not downgrade
   * an installed app, so publishing it would leave every streamer permanently
   * "outdated". Refuses the same versionCode with different contents too --
   * devices already on that code would report current and never receive it.
   */
  ingest(tempFile: string, sha256: string, size: number): StoredApk {
    let info;
    try {
      info = readApkInfo(tempFile);
    } catch (err) {
      fs.rmSync(tempFile, { force: true });
      if (err instanceof ApkError) throw new ApkStoreError(`That file is not a readable APK: ${err.message}`);
      throw err;
    }

    const existing = this.entries.find((e) => e.packageName === info.packageName);
    if (existing) {
      if (existing.sha256 === sha256) {
        fs.rmSync(tempFile, { force: true });
        return existing;
      }
      if (info.versionCode < existing.versionCode) {
        fs.rmSync(tempFile, { force: true });
        throw new ApkStoreError(
          `${labelFor(info.packageName)} ${info.versionName ?? info.versionCode} is older than the stored ${existing.versionName ?? existing.versionCode}. Android will not downgrade an installed app.`,
        );
      }
      if (info.versionCode === existing.versionCode) {
        fs.rmSync(tempFile, { force: true });
        throw new ApkStoreError(
          `${labelFor(info.packageName)} build ${info.versionCode} is already stored with different contents. Streamers on that build would never receive this one -- bump the versionCode.`,
        );
      }
    }

    const entry: StoredApk = {
      packageName: info.packageName,
      versionCode: info.versionCode,
      versionName: info.versionName,
      sha256,
      size,
      uploadedAt: new Date().toISOString(),
    };

    fs.renameSync(tempFile, this.filePath(sha256));
    if (existing) {
      this.entries = this.entries.filter((e) => e !== existing);
      fs.rmSync(this.filePath(existing.sha256), { force: true });
    }
    this.entries.push(entry);
    this.save();
    logger.info({ packageName: entry.packageName, versionCode: entry.versionCode, sha256 }, "APK stored");
    return entry;
  }

  remove(packageName: string): boolean {
    const existing = this.entries.find((e) => e.packageName === packageName);
    if (!existing) return false;
    this.entries = this.entries.filter((e) => e !== existing);
    this.save();
    fs.rmSync(this.filePath(existing.sha256), { force: true });
    return true;
  }
}

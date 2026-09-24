import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { resolveConfigPath } from "./config";
import { logger } from "./logger";

/**
 * Editable per-app launch targets, stored server-side so the package name / URI
 * used to launch each app can be corrected from the management page (e.g. a
 * wrong CNN package) without a code change. Global across displays -- the fleet
 * runs the same image -- keyed by app id. The value replaces the catalog
 * packageName fed to resolveAppUri, so it may be a package name OR an exact URI
 * from the display's getApplicationList.
 */

const StoreSchema = z.record(z.string(), z.string());

export function resolveAppOverridesPath(): string {
  const fromEnv = process.env["APP_OVERRIDES"];
  if (fromEnv && fromEnv.trim() !== "") return path.resolve(fromEnv.trim());
  return path.join(path.dirname(resolveConfigPath()), "app-overrides.json");
}

export class AppOverridesStore {
  private overrides: Record<string, string>;

  constructor(private readonly filePath: string) {
    this.overrides = AppOverridesStore.read(filePath);
  }

  private static read(filePath: string): Record<string, string> {
    try {
      const parsed = StoreSchema.safeParse(JSON.parse(fs.readFileSync(filePath, "utf8")));
      if (!parsed.success) {
        logger.warn({ filePath }, "app-overrides file invalid; ignoring");
        return {};
      }
      return parsed.data;
    } catch {
      return {};
    }
  }

  /** The override for an app, or undefined if it uses the catalog default. */
  get(appId: string): string | undefined {
    const v = this.overrides[appId];
    return v && v.trim() !== "" ? v : undefined;
  }

  all(): Record<string, string> {
    return { ...this.overrides };
  }

  /** Set an override (empty string clears it), then persist atomically. */
  set(appId: string, value: string): void {
    if (value.trim() === "") delete this.overrides[appId];
    else this.overrides[appId] = value.trim();
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.overrides, null, 2), "utf8");
    fs.renameSync(tmp, this.filePath);
    logger.info({ appId }, "app launch target updated");
  }
}

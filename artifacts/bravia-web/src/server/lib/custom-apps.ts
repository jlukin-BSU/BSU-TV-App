import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { z } from "zod";
import { APPS } from "../../shared/catalog";
import { resolveConfigPath } from "./config";
import { setCustomApps, type CustomApp } from "./catalog-runtime";
import { logger } from "./logger";

/**
 * Persists user-added apps (custom-apps.json) and their icon files, and keeps
 * the runtime catalog in sync. Icons are stored as files in an icons directory
 * and served from /icons; the JSON keeps only the filename, so the file and the
 * config responses stay small.
 */

const CustomAppSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  launchValue: z.string().min(1),
  icon: z.string().nullable(),
});
const StoreSchema = z.array(CustomAppSchema);

const RESERVED_IDS = new Set(APPS.map((a) => a.id).concat(["signage", "inputs", "screenoff", "screenon", "poweroff"]));

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

const MAX_ICON_BYTES = 3 * 1024 * 1024;

export function resolveCustomAppsPath(): string {
  const fromEnv = process.env["CUSTOM_APPS"];
  if (fromEnv && fromEnv.trim() !== "") return path.resolve(fromEnv.trim());
  return path.join(path.dirname(resolveConfigPath()), "custom-apps.json");
}

export function resolveIconsDir(): string {
  const fromEnv = process.env["ICONS_DIR"];
  if (fromEnv && fromEnv.trim() !== "") return path.resolve(fromEnv.trim());
  return path.join(path.dirname(resolveConfigPath()), "icons");
}

export class CustomAppsError extends Error {}

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

export class CustomAppsStore {
  private apps: CustomApp[];

  constructor(
    private readonly filePath: string,
    private readonly iconsDir: string,
  ) {
    this.apps = CustomAppsStore.read(filePath);
    try {
      fs.mkdirSync(iconsDir, { recursive: true });
    } catch (err) {
      logger.warn({ iconsDir, err: String(err) }, "could not create icons dir");
    }
    setCustomApps(this.apps);
  }

  private static read(filePath: string): CustomApp[] {
    try {
      const parsed = StoreSchema.safeParse(JSON.parse(fs.readFileSync(filePath, "utf8")));
      if (!parsed.success) {
        logger.warn({ filePath }, "custom-apps file invalid; ignoring");
        return [];
      }
      return parsed.data;
    } catch {
      return [];
    }
  }

  private persist(): void {
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.apps, null, 2), "utf8");
    fs.renameSync(tmp, this.filePath);
    setCustomApps(this.apps);
  }

  list(): CustomApp[] {
    return this.apps;
  }

  private uniqueId(label: string): string {
    let base = slugify(label) || "app";
    if (!RESERVED_IDS.has(base) && !this.apps.some((a) => a.id === base)) return base;
    let n = 2;
    while (RESERVED_IDS.has(`${base}-${n}`) || this.apps.some((a) => a.id === `${base}-${n}`)) n++;
    return `${base}-${n}`;
  }

  /** Decode a data: URL to an icon file, returning its filename. */
  private writeIcon(id: string, dataUrl: string): string {
    const m = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl.trim());
    if (!m) throw new CustomAppsError("Icon must be an image data URL.");
    const ext = MIME_EXT[m[1]!.toLowerCase()];
    if (!ext) throw new CustomAppsError(`Unsupported icon type "${m[1]}". Use PNG, SVG, JPG, WEBP or GIF.`);
    const buf = Buffer.from(m[2]!, "base64");
    if (buf.length > MAX_ICON_BYTES) throw new CustomAppsError("Icon is too large (max 3 MB).");
    const file = `${id}-${crypto.randomBytes(4).toString("hex")}.${ext}`;
    fs.writeFileSync(path.join(this.iconsDir, file), buf);
    return file;
  }

  private removeIconFile(icon: string | null): void {
    if (!icon) return;
    try {
      fs.unlinkSync(path.join(this.iconsDir, icon));
    } catch {
      /* already gone */
    }
  }

  add(input: { label: string; launchValue: string; iconDataUrl?: string }): CustomApp {
    const label = input.label.trim();
    const launchValue = input.launchValue.trim();
    if (!label) throw new CustomAppsError("A label is required.");
    if (!launchValue) throw new CustomAppsError("A launch value (package name or URI) is required.");
    const id = this.uniqueId(label);
    const icon = input.iconDataUrl ? this.writeIcon(id, input.iconDataUrl) : null;
    const app: CustomApp = { id, label, launchValue, icon };
    this.apps = [...this.apps, app];
    this.persist();
    logger.info({ id, label }, "custom app added");
    return app;
  }

  update(id: string, input: { label?: string; launchValue?: string; iconDataUrl?: string }): CustomApp {
    const idx = this.apps.findIndex((a) => a.id === id);
    if (idx === -1) throw new CustomAppsError(`No custom app "${id}".`);
    const current = this.apps[idx]!;
    let icon = current.icon;
    if (input.iconDataUrl) {
      const newIcon = this.writeIcon(id, input.iconDataUrl);
      this.removeIconFile(current.icon);
      icon = newIcon;
    }
    const next: CustomApp = {
      ...current,
      label: input.label !== undefined && input.label.trim() !== "" ? input.label.trim() : current.label,
      launchValue: input.launchValue !== undefined && input.launchValue.trim() !== "" ? input.launchValue.trim() : current.launchValue,
      icon,
    };
    this.apps = this.apps.map((a, i) => (i === idx ? next : a));
    this.persist();
    logger.info({ id }, "custom app updated");
    return next;
  }

  remove(id: string): void {
    const app = this.apps.find((a) => a.id === id);
    if (!app) throw new CustomAppsError(`No custom app "${id}".`);
    this.removeIconFile(app.icon);
    this.apps = this.apps.filter((a) => a.id !== id);
    this.persist();
    logger.info({ id }, "custom app removed");
  }
}

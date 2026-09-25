import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { z } from "zod";
import {
  HELP_MESSAGE_DEFAULT,
  HELP_MESSAGE_MAX,
  HELP_TITLE_DEFAULT,
  HELP_TITLE_MAX,
  LAYOUT_DEFAULT,
  SIGNAGE_URL_MAX,
  isLayoutId,
  type HelpCard,
  type LayoutId,
} from "../../shared/catalog";
import { resolveConfigPath } from "./config";
import { resolveIconsDir } from "./custom-apps";
import { logger } from "./logger";

/**
 * How each display's home screen looks: layout, help card, signage URL.
 *
 * Kept in its own file (presentation.json) rather than overrides.json on
 * purpose: overrides.json is parsed with a strict schema, so adding keys there
 * would make an older build discard every display's tile settings after a
 * rollback. Here, a display with no entry gets the defaults -- the original
 * tile grid -- so nothing changes until someone picks a layout.
 *
 * Entries are read leniently, field by field: an unknown layout or a bad value
 * falls back to its default instead of invalidating the file.
 */

export interface Presentation {
  layout: LayoutId;
  help: HelpCard;
  signageUrl: string | null;
}

interface Entry {
  layout?: string;
  helpShow?: boolean;
  helpTitle?: string;
  helpMessage?: string;
  /** QR image filename in the icons directory. */
  helpQr?: string | null;
  signageUrl?: string;
}

const EntrySchema = z
  .object({
    layout: z.string().optional(),
    helpShow: z.boolean().optional(),
    helpTitle: z.string().optional(),
    helpMessage: z.string().optional(),
    helpQr: z.string().nullable().optional(),
    signageUrl: z.string().optional(),
  })
  .catch({});

const StoreSchema = z.record(z.string(), EntrySchema);

/** What the settings editors (admin panel, management page) may change. */
export const PresentationPatchSchema = z
  .object({
    layout: z.string().refine(isLayoutId, "Unknown layout.").optional(),
    helpShow: z.boolean().optional(),
    helpTitle: z.string().max(HELP_TITLE_MAX).optional(),
    helpMessage: z.string().max(HELP_MESSAGE_MAX).optional(),
    signageUrl: z.string().max(SIGNAGE_URL_MAX).optional(),
  })
  .strict();

export type PresentationPatch = z.infer<typeof PresentationPatchSchema>;

export class PresentationError extends Error {}

const QR_MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};
const MAX_QR_BYTES = 1024 * 1024;

/** Empty clears it; anything else must be an https URL. */
export function normalizeSignageUrl(raw: string): string | null {
  const v = raw.trim();
  if (v === "") return null;
  let url: URL;
  try {
    url = new URL(v);
  } catch {
    throw new PresentationError("Signage URL is not a valid web address.");
  }
  if (url.protocol !== "https:") throw new PresentationError("Signage URL must start with https://.");
  return v;
}

export function resolvePresentationPath(): string {
  const fromEnv = process.env["PRESENTATION_SETTINGS"];
  if (fromEnv && fromEnv.trim() !== "") return path.resolve(fromEnv.trim());
  return path.join(path.dirname(resolveConfigPath()), "presentation.json");
}

export class PresentationStore {
  private entries: Record<string, Entry>;

  constructor(
    private readonly filePath: string,
    private readonly iconsDir: string,
  ) {
    this.entries = PresentationStore.read(filePath);
  }

  private static read(filePath: string): Record<string, Entry> {
    let raw: string;
    try {
      raw = fs.readFileSync(filePath, "utf8");
    } catch {
      return {}; // missing file is normal on first run
    }
    try {
      const parsed = StoreSchema.safeParse(JSON.parse(raw));
      if (parsed.success) return parsed.data;
      logger.warn({ filePath }, "presentation file invalid; using defaults");
    } catch {
      logger.warn({ filePath }, "presentation file is not JSON; using defaults");
    }
    return {};
  }

  private persist(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.entries, null, 2), "utf8");
    fs.renameSync(tmp, this.filePath);
  }

  /** Effective presentation for a display, defaults filled in. */
  get(hostname: string): Presentation {
    const e = this.entries[hostname] ?? {};
    const title = typeof e.helpTitle === "string" && e.helpTitle.trim() !== "" ? e.helpTitle.slice(0, HELP_TITLE_MAX) : HELP_TITLE_DEFAULT;
    const message =
      typeof e.helpMessage === "string" && e.helpMessage.trim() !== "" ? e.helpMessage.slice(0, HELP_MESSAGE_MAX) : HELP_MESSAGE_DEFAULT;
    let signageUrl: string | null = null;
    if (typeof e.signageUrl === "string") {
      try {
        signageUrl = normalizeSignageUrl(e.signageUrl);
      } catch {
        signageUrl = null;
      }
    }
    return {
      layout: isLayoutId(e.layout) ? e.layout : LAYOUT_DEFAULT,
      help: {
        show: e.helpShow ?? true,
        title,
        message,
        qrUrl: e.helpQr ? `/icons/${e.helpQr}` : null,
      },
      signageUrl,
    };
  }

  /** Apply a validated patch. Blank help text resets to the default. */
  update(hostname: string, patch: PresentationPatch): Presentation {
    if (Object.keys(patch).length === 0) return this.get(hostname);
    const e: Entry = { ...(this.entries[hostname] ?? {}) };
    if (patch.layout !== undefined) e.layout = patch.layout;
    if (patch.helpShow !== undefined) e.helpShow = patch.helpShow;
    if (patch.helpTitle !== undefined) {
      if (patch.helpTitle.trim() === "") delete e.helpTitle;
      else e.helpTitle = patch.helpTitle.trim();
    }
    if (patch.helpMessage !== undefined) {
      if (patch.helpMessage.trim() === "") delete e.helpMessage;
      else e.helpMessage = patch.helpMessage.trim();
    }
    if (patch.signageUrl !== undefined) {
      const url = normalizeSignageUrl(patch.signageUrl);
      if (url === null) delete e.signageUrl;
      else e.signageUrl = url;
    }
    this.entries[hostname] = e;
    this.persist();
    logger.info({ hostname, layout: e.layout ?? LAYOUT_DEFAULT }, "saved display presentation");
    return this.get(hostname);
  }

  /** Store an uploaded QR image (data URL) for a display, replacing any previous one. */
  setQr(hostname: string, dataUrl: string): Presentation {
    const m = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl);
    if (!m) throw new PresentationError("QR code must be an uploaded image.");
    const ext = QR_MIME_EXT[m[1]!.toLowerCase()];
    if (!ext) throw new PresentationError("QR code must be a PNG, JPEG, WebP or SVG image.");
    const bytes = Buffer.from(m[2]!, "base64");
    if (bytes.length === 0) throw new PresentationError("The QR image is empty.");
    if (bytes.length > MAX_QR_BYTES) throw new PresentationError("The QR image is larger than 1 MB.");
    // Content-addressed name: /icons is cached as immutable, so a new image must get a new URL.
    const hash = crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 16);
    const file = `qr-${hash}.${ext}`;
    fs.mkdirSync(this.iconsDir, { recursive: true });
    fs.writeFileSync(path.join(this.iconsDir, file), bytes);
    const previous = this.entries[hostname]?.helpQr ?? null;
    this.entries[hostname] = { ...(this.entries[hostname] ?? {}), helpQr: file };
    this.persist();
    this.removeIfUnused(previous);
    logger.info({ hostname, file }, "stored help QR image");
    return this.get(hostname);
  }

  clearQr(hostname: string): Presentation {
    const previous = this.entries[hostname]?.helpQr ?? null;
    if (this.entries[hostname]) {
      delete this.entries[hostname]!.helpQr;
      this.persist();
    }
    this.removeIfUnused(previous);
    return this.get(hostname);
  }

  /** Drop a display's entry (e.g. when the display is deleted). */
  remove(hostname: string): void {
    const previous = this.entries[hostname]?.helpQr ?? null;
    if (!(hostname in this.entries)) return;
    delete this.entries[hostname];
    this.persist();
    this.removeIfUnused(previous);
  }

  /** Several displays can share one QR image (same bytes, same name). */
  private removeIfUnused(file: string | null): void {
    if (!file || !/^qr-[0-9a-f]{16}\.[a-z]+$/.test(file)) return;
    if (Object.values(this.entries).some((e) => e.helpQr === file)) return;
    try {
      fs.unlinkSync(path.join(this.iconsDir, file));
    } catch {
      /* already gone */
    }
  }
}

/** The presentation fields as the settings editors see them. */
export interface PresentationView {
  layout: LayoutId;
  helpShow: boolean;
  helpTitle: string;
  helpMessage: string;
  helpQrUrl: string | null;
  signageUrl: string;
}

export function presentationViewFor(store: PresentationStore, hostname: string): PresentationView {
  const p = store.get(hostname);
  return {
    layout: p.layout,
    helpShow: p.help.show,
    helpTitle: p.help.title,
    helpMessage: p.help.message,
    helpQrUrl: p.help.qrUrl,
    signageUrl: p.signageUrl ?? "",
  };
}

/** The presentation fields out of a combined settings save body. */
export function pickPresentationPatch(input: PresentationPatch): PresentationPatch {
  const out: PresentationPatch = {};
  if (input.layout !== undefined) out.layout = input.layout;
  if (input.helpShow !== undefined) out.helpShow = input.helpShow;
  if (input.helpTitle !== undefined) out.helpTitle = input.helpTitle;
  if (input.helpMessage !== undefined) out.helpMessage = input.helpMessage;
  if (input.signageUrl !== undefined) out.signageUrl = input.signageUrl;
  return out;
}

let shared: PresentationStore | null = null;

/**
 * The process-wide store. A lazy singleton rather than a constructor argument,
 * so the display and management apps share one instance without threading a
 * new parameter through every factory.
 */
export function presentationStore(): PresentationStore {
  if (!shared) shared = new PresentationStore(resolvePresentationPath(), resolveIconsDir());
  return shared;
}

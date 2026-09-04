import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  DEFAULT_TILE_ORDER,
  IDLE_SECONDS_DEFAULT,
  IDLE_SECONDS_MAX,
  IDLE_SECONDS_MIN,
  INPUTS,
  INPUTS_TILE_KEY,
  TILES,
  findTile,
  type ClientTile,
  type DisplaySettings,
} from "../../shared/catalog";
import type { Display } from "./config";
import { resolveConfigPath } from "./config";
import { logger } from "./logger";

/**
 * Admin-editable per-display settings, stored SEPARATELY from devices.json.
 *
 * devices.json holds identity + PSKs and is never rewritten by the app. Admin
 * edits (tile visibility, order, auto-signage) live here, keyed by hostname,
 * with no secrets -- so this file is safe to be app-writable and, unlike
 * devices.json, could even be committed if desired.
 */

const OverrideSchema = z
  .object({
    enabled: z.record(z.string(), z.boolean()).optional(),
    order: z.array(z.string()).optional(),
    autoSignage: z.boolean().optional(),
    idleSeconds: z.number().optional(),
  })
  .strict();

const StoreSchema = z.record(z.string(), OverrideSchema);

export type DisplayOverride = z.infer<typeof OverrideSchema>;

export function resolveOverridesPath(): string {
  const fromEnv = process.env["ADMIN_OVERRIDES"];
  if (fromEnv && fromEnv.trim() !== "") return path.resolve(fromEnv.trim());
  // Default: alongside devices.json.
  return path.join(path.dirname(resolveConfigPath()), "overrides.json");
}

export class SettingsStore {
  private overrides: Record<string, DisplayOverride>;

  constructor(private readonly filePath: string) {
    this.overrides = SettingsStore.read(filePath);
  }

  private static read(filePath: string): Record<string, DisplayOverride> {
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = StoreSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) {
        logger.warn({ filePath, issues: parsed.error.issues }, "overrides file invalid; ignoring");
        return {};
      }
      return parsed.data;
    } catch {
      // Missing file is normal on first run.
      return {};
    }
  }

  get(hostname: string): DisplayOverride | undefined {
    return this.overrides[hostname];
  }

  /** Persist one display's override atomically (temp file + rename). */
  set(hostname: string, override: DisplayOverride): void {
    this.overrides[hostname] = override;
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.overrides, null, 2), "utf8");
    fs.renameSync(tmp, this.filePath);
    logger.info({ hostname, filePath: this.filePath }, "saved display settings");
  }
}

/** Base tile visibility from devices.json / catalog defaults (before admin edits). */
function baseEnabled(display: Display): Record<string, boolean> {
  const enabled: Record<string, boolean> = {};
  for (const tile of TILES) {
    if (tile.kind === "app") enabled[tile.key] = display.apps.includes(tile.key);
    else if (tile.kind === "command") enabled[tile.key] = display.commands.includes(tile.key);
    else if (tile.kind === "input") enabled[tile.key] = display.inputs.length > 0;
  }
  return enabled;
}

export interface EffectiveConfig {
  settings: DisplaySettings;
  /** Ordered, enabled tiles for the grid. */
  tiles: ClientTile[];
  /** Effective enabled sets, for control-endpoint validation. */
  appIds: string[];
  inputIds: string[];
  commandIds: string[];
}

/**
 * Merge a display's base config with any admin override into the effective
 * settings the UI renders and the control endpoints validate against.
 */
export function effectiveConfig(display: Display, override?: DisplayOverride): EffectiveConfig {
  const base = baseEnabled(display);
  const enabled: Record<string, boolean> = { ...base, ...(override?.enabled ?? {}) };

  // Order: start from the override (or default), then append any tiles it omits
  // so a new catalog tile never silently vanishes.
  const requested = override?.order ?? DEFAULT_TILE_ORDER;
  const order = [
    ...requested.filter((k) => findTile(k)),
    ...DEFAULT_TILE_ORDER.filter((k) => !requested.includes(k)),
  ];

  const autoSignage = override?.autoSignage ?? display.autoSignage;

  const rawIdle = override?.idleSeconds ?? IDLE_SECONDS_DEFAULT;
  const idleSeconds = Math.min(
    IDLE_SECONDS_MAX,
    Math.max(IDLE_SECONDS_MIN, Math.round(Number.isFinite(rawIdle) ? rawIdle : IDLE_SECONDS_DEFAULT)),
  );

  const tiles: ClientTile[] = order
    .map((key) => findTile(key))
    .filter((t): t is NonNullable<typeof t> => !!t && enabled[t.key] === true)
    .map((t) => ({ key: t.key, kind: t.kind, label: t.label }));

  const appIds = TILES.filter((t) => t.kind === "app" && enabled[t.key]).map((t) => t.key);
  const commandIds = TILES.filter((t) => t.kind === "command" && enabled[t.key]).map((t) => t.key);
  const inputIds = enabled[INPUTS_TILE_KEY] ? INPUTS.map((i) => i.id) : [];

  return {
    settings: { enabled, order, autoSignage, idleSeconds },
    tiles,
    appIds,
    inputIds,
    commandIds,
  };
}

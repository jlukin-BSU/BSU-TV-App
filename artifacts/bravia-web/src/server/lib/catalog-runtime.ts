import {
  APPS,
  TILES,
  type AppEntry,
  type TileMeta,
} from "../../shared/catalog";

/**
 * Runtime catalog = the built-in apps/tiles PLUS user-added "custom" apps.
 *
 * The custom list is held here as module state and updated by CustomAppsStore.
 * Everything that needs the effective app/tile set (effectiveConfig, the launch
 * route, the settings views) reads it through these helpers instead of the
 * static catalog, so adding an app from the management page shows up everywhere
 * with no restart. With no custom apps, these return exactly the built-ins, so
 * behaviour is unchanged until an app is added.
 */

export interface CustomApp {
  id: string;
  label: string;
  /** Package name or exact URI used to launch it (fed to resolveAppUri). */
  launchValue: string;
  /** Icon filename served from /icons, or null for the generic glyph. */
  icon: string | null;
}

let customApps: CustomApp[] = [];

export function setCustomApps(list: CustomApp[]): void {
  customApps = list;
}

export function getCustomApps(): CustomApp[] {
  return customApps;
}

export function isCustomApp(id: string): boolean {
  return customApps.some((a) => a.id === id);
}

/** Custom apps as tiles, appended after the built-ins (order is admin-editable). */
function customTiles(): TileMeta[] {
  return customApps.map((a) => ({ key: a.id, kind: "app" as const, label: a.label, defaultEnabled: false }));
}

export function runtimeTiles(): TileMeta[] {
  return [...TILES, ...customTiles()];
}

export function runtimeDefaultOrder(): string[] {
  return runtimeTiles().map((t) => t.key);
}

export function findRuntimeTile(key: string): TileMeta | undefined {
  return runtimeTiles().find((t) => t.key === key);
}

export function runtimeApps(): AppEntry[] {
  const custom: AppEntry[] = customApps.map((a) => ({
    id: a.id,
    label: a.label,
    packageName: a.launchValue,
    enabledByDefault: false,
  }));
  return [...APPS, ...custom];
}

export function findRuntimeApp(id: string): AppEntry | undefined {
  return runtimeApps().find((a) => a.id === id);
}

/** Icon URL for a tile, if it's a custom app with an icon; else undefined. */
export function appIconUrl(id: string): string | undefined {
  const a = customApps.find((x) => x.id === id);
  return a && a.icon ? `/icons/${a.icon}` : undefined;
}

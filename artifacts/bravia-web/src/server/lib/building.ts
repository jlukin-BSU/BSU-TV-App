import type { Display } from "./config";

/**
 * The building code is the leading run of letters in the hostname (3-4 letters
 * before the numbers), e.g. "RSU101" or "RSU-101" -> "RSU". Uppercased so it is
 * a stable group key. Anything without a leading letter run falls into "OTHER".
 */
export function buildingOf(hostname: string): string {
  const m = /^[^a-zA-Z0-9]*([a-zA-Z]+)/.exec(hostname);
  return m ? m[1]!.toUpperCase() : "OTHER";
}

/** Distinct building codes across the registry, sorted. */
export function buildingsIn(displays: Display[]): string[] {
  const set = new Set(displays.map((d) => buildingOf(d.hostname)));
  return [...set].sort();
}

/** Displays belonging to a building (case-insensitive match on the code). */
export function displaysInBuilding(displays: Display[], building: string): Display[] {
  const b = building.trim().toUpperCase();
  return displays.filter((d) => buildingOf(d.hostname) === b);
}

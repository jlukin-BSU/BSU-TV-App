import type { Display } from "./config";

/**
 * The building code is the run of letters IMMEDIATELY BEFORE the numbers, e.g.
 * "tv-rsu008-l" -> "RSU", "RSU101" -> "RSU". (Not the leading letters -- names
 * may carry a "tv-" prefix.) Uppercased so it is a stable group key. A name with
 * no letters-then-digit falls into "OTHER".
 */
export function buildingOf(hostname: string): string {
  const m = /([a-zA-Z]+)\d/.exec(hostname);
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

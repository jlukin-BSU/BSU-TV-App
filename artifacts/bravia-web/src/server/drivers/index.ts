import type { Display } from "../lib/config";
import type { AppControl, DisplayDriver } from "./types";
import { DriverError as DriverErrorClass } from "./types";
import { sonyDriver } from "./sony";

export { DriverError } from "./types";
export type {
  AppControl,
  DisplayDriver,
  InstalledApp,
  PlayingContent,
  PowerStatus,
  ScreenState,
  VolumeInfo,
} from "./types";

const DRIVERS: Record<string, DisplayDriver> = {
  [sonyDriver.id]: sonyDriver,
};

/**
 * The driver for a display.
 *
 * Every registered display is a Sony today, and the device config has no
 * `driver` field yet -- that arrives with the systems/roles schema. Until then
 * this resolves to Sony for everything, which keeps existing installs behaving
 * exactly as before while giving callers the seam to dispatch through.
 */
export function driverFor(_display: Display): DisplayDriver {
  return sonyDriver;
}

/**
 * App control for a display, or a clear failure if the panel has none.
 *
 * Callers that launch apps go through this rather than checking `driver.apps`
 * themselves, so the day an LG panel is registered the error names the reason
 * instead of surfacing as "cannot read properties of undefined".
 */
export function appsFor(display: Display): AppControl {
  const driver = driverFor(display);
  if (!driver.apps) {
    throw new DriverErrorClass(
      `${display.hostname} is a ${driver.id} panel, which has no app platform of its own. App launch for this display belongs to its streaming device.`,
    );
  }
  return driver.apps;
}

/** Look a driver up by id, for config validation and the management UI. */
export function driverById(id: string): DisplayDriver | undefined {
  return DRIVERS[id];
}

/** Ids of every driver the server can speak. */
export function driverIds(): string[] {
  return Object.keys(DRIVERS);
}

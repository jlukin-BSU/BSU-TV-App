import type { Display } from "../lib/config";
import type { AppControl, Capability, DisplayDriver } from "./types";
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
  if (display.appSource === "streamer") {
    throw new DriverErrorClass(
      `${display.hostname} is configured to launch apps on its streaming device, not on the panel. Change appSource to "display" to drive the panel's own apps.`,
    );
  }
  return driver.apps;
}

/**
 * Whether this installation launches apps on the panel or on a streaming device.
 *
 * Capability and configuration are deliberately separate. A Sony BZ30L supports
 * apps, but paired with a streamer it should be set to "streamer" so the panel's
 * app platform goes unused. A Sony model that drops the app platform, or an LG
 * that gains one, only changes what the driver declares -- no room's config has
 * to be revisited, and no caller grows a check on the make.
 */
export function appSourceFor(display: Display): "display" | "streamer" {
  if (display.appSource) return display.appSource;
  return supports(display, "apps") ? "display" : "streamer";
}

/** Whether the panel in this installation is capable of a given thing. */
export function supports(display: Display, capability: Capability): boolean {
  return driverFor(display).supports.has(capability);
}

/** Look a driver up by id, for config validation and the management UI. */
export function driverById(id: string): DisplayDriver | undefined {
  return DRIVERS[id];
}

/** Ids of every driver the server can speak. */
export function driverIds(): string[] {
  return Object.keys(DRIVERS);
}

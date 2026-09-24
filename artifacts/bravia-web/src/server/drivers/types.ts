import type { Display } from "../lib/config";

/**
 * The control contract a display must satisfy, independent of make.
 *
 * Sony Professional displays speak a JSON-RPC REST API over HTTP with a
 * pre-shared key. LG commercial panels speak a terse ASCII command set over a
 * socket. Extron and others differ again. Callers should not care, so nothing
 * above this layer may reach for a vendor API directly.
 *
 * Capability groups that not every panel has are optional properties rather
 * than methods that throw. `apps` is the important one: a Sony BZ30L runs the
 * streaming apps itself, whereas an LG UR340C cannot -- it has no app platform
 * at all -- so on those installs a separate streaming device owns app launch.
 * Checking `driver.apps` is how a caller asks "can this panel do it itself?"
 * without hard-coding a list of models.
 */

/**
 * Something a panel may be able to do.
 *
 * This is a statement about the model and firmware, NOT about how a given
 * installation is wired. A Sony BZ30L supports `apps`, but if it is paired with
 * a streaming device then the streamer should own app launch even though the
 * panel could do it. Equally, a Sony model that drops the app platform, or an
 * LG that gains one, changes what is *supported* without changing how any
 * existing room is configured. Keep the two separate: drivers declare support,
 * device config decides ownership.
 */
export type Capability = "power" | "input" | "volume" | "mute" | "screen" | "apps";

export type PowerStatus = "active" | "standby" | "unknown";

export interface VolumeInfo {
  volume: number;
  mute: boolean;
  min: number;
  max: number;
}

export interface PlayingContent {
  /** e.g. "extInput:hdmi?port=3" or an app uri. */
  uri: string;
  title: string;
  source: string;
}

export interface InstalledApp {
  title: string;
  uri: string;
}

/** How the screen is blanked. `standby` is a real power-off, not a blank. */
export type ScreenState = "pictureOff" | "pictureOn" | "standby";

/**
 * Any failure talking to a device: unreachable, rejected credentials, or a
 * vendor-level error returned in an otherwise successful HTTP response.
 * `code` is the vendor's own code where there is one.
 */
export class DriverError extends Error {
  constructor(
    message: string,
    readonly code?: number,
  ) {
    super(message);
    this.name = "DriverError";
  }
}

/** Present only on displays that run apps themselves. */
export interface AppControl {
  /** Apps the panel reports as installed. */
  list(display: Display): Promise<InstalledApp[]>;
  /** Map an Android package name to the launch URI this panel reports. */
  resolveUri(display: Display, packageName: string): Promise<string>;
  /** Launch by the URI the panel reported. */
  setActive(display: Display, uri: string): Promise<void>;
  /** Drop cached app lists; all of them when no key is given. */
  clearCache(key?: string): void;
}

export interface DisplayDriver {
  /** Stable id, matching the `driver` value used in device config. */
  readonly id: string;

  /**
   * Whether the protocol authenticates with a pre-shared key. Sony does; LG's
   * command set has no auth at all. Config validation asks the driver rather
   * than assuming every panel needs a PSK.
   */
  readonly requiresPsk: boolean;

  /**
   * What this model can do. Declared, never inferred from the make elsewhere in
   * the codebase -- nothing above this layer should contain "if Sony".
   */
  readonly supports: ReadonlySet<Capability>;

  getPowerStatus(display: Display): Promise<PowerStatus>;
  setPower(display: Display, on: boolean): Promise<void>;

  getVolume(display: Display): Promise<VolumeInfo | null>;
  setVolume(display: Display, volume: number): Promise<void>;
  stepVolume(display: Display, delta: number): Promise<void>;
  setMute(display: Display, mute: boolean): Promise<void>;

  /** Switch to an HDMI port. */
  setInput(display: Display, port: number): Promise<void>;
  setScreenState(display: Display, kind: ScreenState): Promise<void>;
  getPlayingContent(display: Display): Promise<PlayingContent | null>;

  /**
   * How to drive the panel's apps. Present iff `supports` includes "apps" --
   * that is, iff the model is capable. Whether a given installation actually
   * uses it is a separate question, answered by appsFor().
   */
  readonly apps?: AppControl;
}

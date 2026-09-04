/**
 * Button catalog for the web hub.
 *
 * Ported from the Capacitor app (`artifacts/bsu-tv-hub`):
 *   - HDMI labels come from `components/HdmiPicker.tsx` (INPUTS)
 *   - App package names come from `plugins/app-launcher.ts` + `App.tsx` (EXTERNAL_APPS)
 *   - `enabledByDefault` mirrors DEFAULT_TILE_VISIBILITY in `hooks/use-hub-settings.ts`
 *
 * Shared by the server (to validate requests) and the web UI (to render buttons),
 * so the two can never drift.
 */

export interface InputEntry {
  id: string;
  label: string;
  /** Physical HDMI port number on the display. */
  port: number;
}

export interface AppEntry {
  id: string;
  label: string;
  /**
   * Android package name. The Sony REST API cannot launch by package name --
   * `setActiveApp` needs a URI from `getApplicationList` -- so the server
   * resolves package -> URI per display at runtime. See `lib/bravia.ts`.
   */
  packageName: string;
  enabledByDefault: boolean;
}

export interface CommandEntry {
  id: string;
  label: string;
  /**
   * What the server sends. `pictureOff` blanks the panel but leaves the display
   * powered and reachable over IP -- important here, because this UI runs *in*
   * the display's own browser and a full standby would kill the page. `standby`
   * is a real power-off, kept as a separate command.
   */
  kind: "pictureOff" | "pictureOn" | "standby";
  enabledByDefault: boolean;
}

/**
 * Wall labels vs. physical ports.
 *
 * The wall plates labelled "HDMI 1" and "HDMI 2" are wired to the display's
 * physical HDMI 3 and HDMI 4. Confirmed against the old relay's tested mapping
 * (SIMPLE IP `*SCINP:3#` / `*SCINP:4#` for HDMI1 / HDMI2) -- see
 * /home/its/tv-relay/server.js on the NUC. So the REST `port` is 3/4, not 1/2,
 * even though the button still reads "Wall HDMI 1/2".
 */
export const INPUTS: readonly InputEntry[] = [
  { id: "hdmi1", label: "Wall HDMI 1", port: 3 },
  { id: "hdmi2", label: "Wall HDMI 2", port: 4 },
] as const;

/** Mirrors EXTERNAL_APPS in the Capacitor app's App.tsx. */
export const APPS: readonly AppEntry[] = [
  { id: "signage", label: "News & Announcements", packageName: "com.optisigns.playe1", enabledByDefault: true },
  { id: "livetv", label: "Live TV", packageName: "com.plexapp.android", enabledByDefault: true },
  { id: "youtube", label: "YouTube", packageName: "com.google.android.youtube.tv", enabledByDefault: true },
  { id: "hulu", label: "Hulu", packageName: "com.hulu.livingroomplus", enabledByDefault: false },
  { id: "netflix", label: "Netflix", packageName: "com.netflix.ninja", enabledByDefault: false },
  { id: "tubi", label: "Tubi", packageName: "com.tubitv", enabledByDefault: false },

  // Added 2026-09. Package names are best-guess Android-TV ids; VERIFY each
  // against GET /api/apps on a real display -- setActiveApp launches by the
  // exact reported URI, and resolveAppUri surfaces a clear error if unmatched.
  { id: "prime", label: "Prime Video", packageName: "com.amazon.amazonvideo.livingroom", enabledByDefault: false },
  { id: "disneyplus", label: "Disney+", packageName: "com.disney.disneyplus", enabledByDefault: false },
  { id: "max", label: "Max", packageName: "com.wbd.stream", enabledByDefault: false },
  { id: "appletv", label: "Apple TV+", packageName: "com.apple.atve.androidtv.appletv", enabledByDefault: false },
  { id: "peacock", label: "Peacock", packageName: "com.peacocktv.peacockandroid", enabledByDefault: false },
  { id: "paramount", label: "Paramount+", packageName: "com.cbs.ott", enabledByDefault: false },
  { id: "pluto", label: "Pluto TV", packageName: "tv.pluto.android", enabledByDefault: false },
  // Likely NOT present on a BRAVIA (Roku is a competing platform) -- confirm.
  { id: "roku", label: "The Roku Channel", packageName: "com.roku.web.trc", enabledByDefault: false },
  // Often no native Android-TV app -- confirm on the display.
  { id: "cnn", label: "CNN", packageName: "com.cnn.mobile.android.phone", enabledByDefault: false },
] as const;

/**
 * System commands. Replaces the Capacitor app's relay actions (PWROFF via
 * `relay.ts`, and the documented no-op `plugins/screen-off.ts`).
 *
 * The old CAST and AIRPLAY relay actions are intentionally absent: there is no
 * documented Sony REST equivalent -- casting is initiated from the phone or
 * laptop, not the display -- so they need a different mechanism, not a guess.
 */
export const COMMANDS: readonly CommandEntry[] = [
  { id: "screenoff", label: "Screen Off", kind: "pictureOff", enabledByDefault: true },
  { id: "screenon", label: "Screen On", kind: "pictureOn", enabledByDefault: false },
  { id: "poweroff", label: "Power Off", kind: "standby", enabledByDefault: false },
] as const;

export function findInput(id: string): InputEntry | undefined {
  return INPUTS.find((i) => i.id === id);
}

export function findApp(id: string): AppEntry | undefined {
  return APPS.find((a) => a.id === id);
}

export function findCommand(id: string): CommandEntry | undefined {
  return COMMANDS.find((c) => c.id === id);
}

export type TileKind = "app" | "input" | "command";

/**
 * The grid, unified. Each tile is one of the app/input/command entries above.
 * `key` is the app id, the command id, or the literal "inputs" for the HDMI
 * picker (which fronts all INPUTS). This is the single source of truth for tile
 * order and default visibility, shared by the admin panel and the hub.
 */
export interface TileMeta {
  key: string;
  kind: TileKind;
  label: string;
  defaultEnabled: boolean;
}

export const INPUTS_TILE_KEY = "inputs";

export const TILES: readonly TileMeta[] = [
  { key: "signage", kind: "app", label: "News & Announcements", defaultEnabled: true },
  { key: "livetv", kind: "app", label: "Live TV", defaultEnabled: true },
  { key: INPUTS_TILE_KEY, kind: "input", label: "TV Inputs", defaultEnabled: true },
  { key: "youtube", kind: "app", label: "YouTube", defaultEnabled: true },
  { key: "screenoff", kind: "command", label: "Screen Off", defaultEnabled: true },
  { key: "hulu", kind: "app", label: "Hulu", defaultEnabled: false },
  { key: "netflix", kind: "app", label: "Netflix", defaultEnabled: false },
  { key: "tubi", kind: "app", label: "Tubi", defaultEnabled: false },
  { key: "prime", kind: "app", label: "Prime Video", defaultEnabled: false },
  { key: "disneyplus", kind: "app", label: "Disney+", defaultEnabled: false },
  { key: "max", kind: "app", label: "Max", defaultEnabled: false },
  { key: "appletv", kind: "app", label: "Apple TV+", defaultEnabled: false },
  { key: "peacock", kind: "app", label: "Peacock", defaultEnabled: false },
  { key: "paramount", kind: "app", label: "Paramount+", defaultEnabled: false },
  { key: "pluto", kind: "app", label: "Pluto TV", defaultEnabled: false },
  { key: "roku", kind: "app", label: "The Roku Channel", defaultEnabled: false },
  { key: "cnn", kind: "app", label: "CNN", defaultEnabled: false },
  { key: "poweroff", kind: "command", label: "Power Off", defaultEnabled: false },
] as const;

export const DEFAULT_TILE_ORDER: string[] = TILES.map((t) => t.key);

export function findTile(key: string): TileMeta | undefined {
  return TILES.find((t) => t.key === key);
}

/** One tile as sent to the client: ordered and already filtered to enabled. */
export interface ClientTile {
  key: string;
  kind: TileKind;
  label: string;
}

/** Idle-timeout bounds (seconds), shared by the admin UI and server validation. */
export const IDLE_SECONDS_DEFAULT = 300;
export const IDLE_SECONDS_MIN = 30;
export const IDLE_SECONDS_MAX = 3600;

/** Per-display settings the admin panel edits. */
export interface DisplaySettings {
  /** tile key -> shown. Missing keys fall back to the tile's default. */
  enabled: Record<string, boolean>;
  /** Tile keys in display order. */
  order: string[];
  /** Return to signage when idle. */
  autoSignage: boolean;
  /** Seconds of inactivity before returning to signage. */
  idleSeconds: number;
}

/** Shape of GET /api/config -- what the UI needs to render itself. */
export interface ClientConfig {
  device: { hostname: string; label: string; ip: string; dryRun: boolean };
  /** Grid tiles, ordered and enabled. */
  tiles: ClientTile[];
  /** Full input list for the HDMI picker. */
  inputs: InputEntry[];
  autoSignage: boolean;
  /** Idle timeout in milliseconds, for the client's idle watcher. */
  idleMs: number;
}

import { logger } from "../lib/logger";
import type { Display } from "../lib/config";
import { DriverError } from "./types";
import type {
  Capability,
  DisplayDriver,
  InstalledApp,
  PlayingContent,
  PowerStatus,
  ScreenState,
  VolumeInfo,
} from "./types";

/**
 * Client for the Sony BRAVIA Professional Display REST API.
 *
 * Plain HTTP, JSON-RPC-style, authenticated with a per-display Pre-Shared Key
 * in the `X-Auth-PSK` header. No TLS is involved in this API at all -- the
 * HTTPS requirement in this project applies only to the browser-facing frontend.
 */

const DEFAULT_TIMEOUT_MS = 5000;
/** How long a display's resolved application list stays cached. */
const APP_LIST_TTL_MS = 10 * 60 * 1000;

interface SonyEnvelope {
  result?: unknown[];
  error?: [number, string];
  id?: number;
}

interface RpcCall {
  service: "avContent" | "appControl" | "system" | "audio";
  method: string;
  id: number;
  params?: unknown[];
}

function timeoutMs(): number {
  const raw = process.env["BRAVIA_TIMEOUT_MS"];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

/**
 * Issue one JSON-RPC call to a display.
 *
 * Sony answers with HTTP 200 even when the command failed, putting the failure
 * in an `error` tuple in the body -- so checking `res.ok` alone silently
 * swallows real errors. Both paths are handled here.
 */
async function call(display: Display, rpc: RpcCall): Promise<unknown[]> {
  const body = {
    method: rpc.method,
    id: rpc.id,
    params: rpc.params ?? [],
    version: "1.0",
  };

  const target = display.targetIp;

  if (display.dryRun) {
    logger.info(
      { display: display.hostname, url: `http://${target ?? "(unresolved)"}/sony/${rpc.service}`, body, dryRun: true },
      "DRY RUN -- Sony command not sent",
    );
    return dryRunResult(rpc);
  }

  if (!target) {
    throw new DriverError(
      `Could not resolve ${display.hostname} to an IP address. Check the display's DNS record / DHCP reservation, or set an IP override for it.`,
    );
  }

  const url = `http://${target}/sony/${rpc.service}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Auth-PSK": display.psk,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs()),
    });
  } catch (err) {
    const reason =
      err instanceof Error && err.name === "TimeoutError"
        ? `did not respond within ${timeoutMs()}ms`
        : err instanceof Error
          ? err.message
          : String(err);
    throw new DriverError(
      `Could not reach ${display.hostname} (${target}): ${reason}. Check the display is powered on and IP control is enabled.`,
    );
  }

  const text = await res.text();

  if (res.status === 403) {
    throw new DriverError(
      `${display.hostname} rejected the Pre-Shared Key (HTTP 403). Confirm the PSK in devices.json matches the display's Settings -> Network & Internet -> Local network setup -> IP control.`,
      403,
    );
  }

  if (!res.ok) {
    throw new DriverError(
      `${display.hostname} returned HTTP ${res.status} ${res.statusText} for ${rpc.method}.`,
      res.status,
    );
  }

  let envelope: SonyEnvelope;
  try {
    envelope = JSON.parse(text) as SonyEnvelope;
  } catch {
    throw new DriverError(
      `${display.hostname} returned a non-JSON response to ${rpc.method}: ${text.slice(0, 200)}`,
    );
  }

  if (envelope.error) {
    const [code, message] = envelope.error;
    throw new DriverError(
      `${display.hostname} rejected ${rpc.method}: ${message} (Sony error ${code}).`,
      code,
    );
  }

  return envelope.result ?? [];
}

/** Plausible stand-in payloads so dry-run exercises the same code paths. */
function dryRunResult(rpc: RpcCall): unknown[] {
  if (rpc.method === "getApplicationList") {
    return [
      [
        { title: "OptiSigns", uri: "com.optisigns.playe1.MainActivity", icon: "" },
        { title: "Xfinity Stream", uri: "com.xfinity.cloudtvr.tenfoot.MainActivity", icon: "" },
        { title: "YouTube", uri: "com.google.android.youtube.tv.MainActivity", icon: "" },
        { title: "Hulu", uri: "com.hulu.livingroomplus.MainActivity", icon: "" },
        { title: "Netflix", uri: "com.netflix.ninja.MainActivity", icon: "" },
        { title: "Tubi", uri: "com.tubitv.MainActivity", icon: "" },
      ],
    ];
  }
  if (rpc.method === "getPowerStatus") return [{ status: "active" }];
  if (rpc.method === "getVolumeInformation") {
    return [[{ target: "speaker", volume: 12, mute: false, minVolume: 0, maxVolume: 100 }]];
  }
  if (rpc.method === "getPlayingContentInfo") {
    return [{ uri: "extInput:hdmi?port=3", title: "HDMI 3", source: "extInput:hdmi" }];
  }
  return [];
}

/** Switch the display to an HDMI port. */
async function setInput(display: Display, port: number): Promise<void> {
  await call(display, {
    service: "avContent",
    method: "setPlayContent",
    id: 20,
    params: [{ uri: `extInput:hdmi?port=${port}` }],
  });
}

/** Raw `getApplicationList` for a display. */
async function getApplicationList(display: Display): Promise<InstalledApp[]> {
  const result = await call(display, {
    service: "appControl",
    method: "getApplicationList",
    id: 60,
  });

  const first = result[0];
  if (!Array.isArray(first)) return [];

  return first
    .filter(
      (entry): entry is { title?: unknown; uri?: unknown } =>
        typeof entry === "object" && entry !== null,
    )
    .map((entry) => ({
      title: typeof entry.title === "string" ? entry.title : "",
      uri: typeof entry.uri === "string" ? entry.uri : "",
    }))
    .filter((entry) => entry.uri !== "");
}

interface CacheEntry {
  expires: number;
  apps: InstalledApp[];
}

/**
 * Per-display cache, keyed by hostname (stable across DHCP changes) so
 * simultaneous use by several displays never shares state and the cache
 * survives a display's IP moving.
 */
const appListCache = new Map<string, CacheEntry>();
/** In-flight fetches, so rapid clicks on one display don't stampede it. */
const inFlight = new Map<string, Promise<InstalledApp[]>>();

async function cachedApplicationList(display: Display): Promise<InstalledApp[]> {
  const now = Date.now();
  const cached = appListCache.get(display.hostname);
  if (cached && cached.expires > now) return cached.apps;

  const pending = inFlight.get(display.hostname);
  if (pending) return pending;

  const fetchPromise = getApplicationList(display)
    .then((apps) => {
      appListCache.set(display.hostname, { expires: Date.now() + APP_LIST_TTL_MS, apps });
      return apps;
    })
    .finally(() => {
      inFlight.delete(display.hostname);
    });

  inFlight.set(display.hostname, fetchPromise);
  return fetchPromise;
}

function clearAppListCache(ip?: string): void {
  if (ip) appListCache.delete(ip);
  else appListCache.clear();
}

/**
 * Resolve an Android package name to the launch URI this display reports.
 *
 * The Capacitor app could launch by package name because it fired an Android
 * intent from on-device. `setActiveApp` cannot -- it needs a URI out of
 * `getApplicationList` -- so we look it up and cache it per display.
 */
async function resolveAppUri(
  display: Display,
  packageName: string,
): Promise<string> {
  const apps = await cachedApplicationList(display);

  const exact = apps.find((a) => a.uri === packageName);
  if (exact) return exact.uri;

  const prefixed = apps.find(
    (a) => a.uri.startsWith(`${packageName}.`) || a.uri.startsWith(`${packageName}/`),
  );
  if (prefixed) return prefixed.uri;

  const contains = apps.find((a) => a.uri.includes(packageName));
  if (contains) return contains.uri;

  throw new DriverError(
    `${display.hostname} has no installed app matching "${packageName}". Installed URIs: ${
      apps.length ? apps.map((a) => a.uri).join(", ") : "(none reported)"
    }`,
  );
}

/** Launch an app by the URI the display reported. */
async function setActiveApp(display: Display, uri: string): Promise<void> {
  await call(display, {
    service: "appControl",
    method: "setActiveApp",
    id: 601,
    params: [{ uri }],
  });
}

/**
 * Blank or restore the panel, or drop the display to standby.
 *
 * `pictureOff` is the right default for a "Screen Off" button here: the panel
 * goes dark but the display stays powered and reachable, so this page keeps
 * running and can turn it back on. `standby` is a genuine power-off and will
 * tear down the browser session along with everything else.
 */
async function setScreenState(
  display: Display,
  kind: ScreenState,
): Promise<void> {
  if (kind === "standby") {
    await call(display, {
      service: "system",
      method: "setPowerStatus",
      id: 55,
      params: [{ status: false }],
    });
    return;
  }

  await call(display, {
    service: "system",
    method: "setPowerSavingMode",
    id: 52,
    params: [{ mode: kind === "pictureOff" ? "pictureOff" : "off" }],
  });
}

// ---- Read + control, for the monitoring dashboard -------------------------

/** "active" (on), "standby" (off), or "unknown" if it couldn't be read. */
async function getPowerStatus(display: Display): Promise<PowerStatus> {
  const result = await call(display, { service: "system", method: "getPowerStatus", id: 50 });
  const first = result[0] as { status?: unknown } | undefined;
  const status = typeof first?.status === "string" ? first.status : "";
  if (status === "active") return "active";
  if (status === "standby") return "standby";
  return "unknown";
}

/** Turn the display fully on or off (standby). */
async function setPower(display: Display, on: boolean): Promise<void> {
  await call(display, { service: "system", method: "setPowerStatus", id: 55, params: [{ status: on }] });
}

/** Speaker volume/mute, or null if the display didn't report it. */
async function getVolume(display: Display): Promise<VolumeInfo | null> {
  const result = await call(display, { service: "audio", method: "getVolumeInformation", id: 33 });
  const arr = Array.isArray(result[0]) ? (result[0] as Array<Record<string, unknown>>) : [];
  const speaker = arr.find((t) => t["target"] === "speaker") ?? arr[0];
  if (!speaker || typeof speaker["volume"] !== "number") return null;
  return {
    volume: speaker["volume"] as number,
    mute: speaker["mute"] === true,
    min: typeof speaker["minVolume"] === "number" ? (speaker["minVolume"] as number) : 0,
    max: typeof speaker["maxVolume"] === "number" ? (speaker["maxVolume"] as number) : 100,
  };
}

/** Set an absolute speaker volume. */
async function setVolume(display: Display, volume: number): Promise<void> {
  await call(display, {
    service: "audio",
    method: "setAudioVolume",
    id: 601,
    params: [{ target: "speaker", volume: String(Math.round(volume)) }],
  });
}

/** Nudge the volume up or down (relative), which the API expresses as "+1"/"-3". */
async function stepVolume(display: Display, delta: number): Promise<void> {
  const sign = delta >= 0 ? "+" : "-";
  await call(display, {
    service: "audio",
    method: "setAudioVolume",
    id: 601,
    params: [{ target: "speaker", volume: `${sign}${Math.abs(Math.round(delta))}` }],
  });
}

async function setMute(display: Display, mute: boolean): Promise<void> {
  await call(display, { service: "audio", method: "setAudioMute", id: 601, params: [{ status: mute }] });
}

/** What the display is currently showing, or null (e.g. it's in standby). */
async function getPlayingContent(display: Display): Promise<PlayingContent | null> {
  const result = await call(display, { service: "avContent", method: "getPlayingContentInfo", id: 103 });
  const first = result[0] as { uri?: unknown; title?: unknown; source?: unknown } | undefined;
  if (!first || typeof first.uri !== "string") return null;
  return {
    uri: first.uri,
    title: typeof first.title === "string" ? first.title : "",
    source: typeof first.source === "string" ? first.source : "",
  };
}

/**
 * Sony BRAVIA Professional. Capable of running the streaming apps itself, so
 * it declares the "apps" capability -- but an installation that pairs one with
 * a streaming device sets appSource "streamer" and leaves that unused.
 */
export const sonyDriver: DisplayDriver = {
  id: "sony-bravia",
  requiresPsk: true,
  supports: new Set<Capability>(["power", "input", "volume", "mute", "screen", "apps"]),

  getPowerStatus,
  setPower,
  getVolume,
  setVolume,
  stepVolume,
  setMute,
  setInput,
  setScreenState,
  getPlayingContent,

  apps: {
    list: getApplicationList,
    resolveUri: resolveAppUri,
    setActive: setActiveApp,
    clearCache: clearAppListCache,
  },
};

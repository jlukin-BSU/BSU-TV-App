import type { Display } from "./config";
import { INPUTS } from "../../shared/catalog";
import { runtimeApps } from "./catalog-runtime";
import {
  getPlayingContent,
  getPowerStatus,
  getVolume,
  BraviaError,
} from "./bravia";
import { buildingOf } from "./building";
import { logger } from "./logger";

/**
 * Polls each display's Sony REST API for power/volume/current-source and caches
 * the result. The dashboard reads the cache (fast); polling runs on a long
 * background interval plus an on-demand refresh when a dashboard page loads, to
 * keep network traffic low.
 */

export interface DisplayState {
  hostname: string;
  label: string;
  building: string;
  /** on | off (standby) | offline (unreachable) | unknown. */
  power: "on" | "off" | "offline" | "unknown";
  volume: number | null;
  mute: boolean | null;
  /** Friendly current source/app, e.g. "Wall HDMI 1" or "Netflix". */
  source: string | null;
  dryRun: boolean;
  updatedAt: number | null;
}

const cache = new Map<string, DisplayState>();

/** Turn a getPlayingContentInfo uri into a friendly label. */
function labelForContent(uri: string, title: string): string {
  const hdmi = /extInput:hdmi\?port=(\d+)/.exec(uri);
  if (hdmi) {
    const port = Number(hdmi[1]);
    const input = INPUTS.find((i) => i.port === port);
    return input ? input.label : `HDMI ${port}`;
  }
  if (uri.startsWith("extInput:")) return title || uri.replace("extInput:", "");
  // App uri: match against known apps by package/uri substring.
  const app = runtimeApps().find((a) => uri.includes(a.packageName) || a.packageName.includes(uri));
  if (app) return app.label;
  return title || "App";
}

function baseState(display: Display): DisplayState {
  return {
    hostname: display.hostname,
    label: display.label,
    building: buildingOf(display.hostname),
    power: "unknown",
    volume: null,
    mute: null,
    source: null,
    dryRun: display.dryRun,
    updatedAt: null,
  };
}

async function pollOne(display: Display): Promise<DisplayState> {
  const state = baseState(display);
  try {
    const power = await getPowerStatus(display);
    if (power === "standby") {
      state.power = "off";
      state.updatedAt = Date.now();
      return state;
    }
    state.power = power === "active" ? "on" : "unknown";

    // Volume and current content are only meaningful when on.
    const [vol, content] = await Promise.allSettled([getVolume(display), getPlayingContent(display)]);
    if (vol.status === "fulfilled" && vol.value) {
      state.volume = vol.value.volume;
      state.mute = vol.value.mute;
    }
    if (content.status === "fulfilled" && content.value) {
      // An external input (HDMI, etc.) reports here...
      state.source = labelForContent(content.value.uri, content.value.title);
    } else {
      // ...but Sony's getPlayingContentInfo has nothing to report when the panel
      // is on an app or the HTML5 kiosk (it errors / returns empty), so show
      // that rather than a blank.
      state.source = "App / Home";
    }
    state.updatedAt = Date.now();
    return state;
  } catch (err) {
    // A network failure/timeout means the panel is unreachable (off at the wall,
    // or network-standby disabled). Sony's "display is off" error also lands here.
    if (err instanceof BraviaError) {
      state.power = "offline";
    } else {
      state.power = "offline";
    }
    state.updatedAt = Date.now();
    return state;
  }
}

/** Poll a set of displays with limited concurrency, updating the cache. */
export async function refresh(displays: Display[], concurrency = 6): Promise<void> {
  let i = 0;
  async function worker(): Promise<void> {
    while (i < displays.length) {
      const display = displays[i++]!;
      const state = await pollOne(display);
      cache.set(display.hostname, state);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, displays.length) }, worker));
}

/** Cached state for the given displays (poll-on-miss is the caller's job). */
export function statesFor(displays: Display[]): DisplayState[] {
  return displays.map((d) => cache.get(d.hostname) ?? baseState(d));
}

/** Start the long-interval background poll of the whole registry. */
export function startBackgroundPoll(getDisplays: () => Display[], intervalMs: number): NodeJS.Timeout {
  const timer = setInterval(() => {
    refresh(getDisplays()).catch((err) => logger.warn({ err: String(err) }, "dashboard poll failed"));
  }, intervalMs);
  timer.unref();
  return timer;
}

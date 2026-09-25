import { useEffect, useRef } from "react";
import { getConfigVersion } from "../lib/api";

/**
 * Reload the page when this display's config changes on the server.
 *
 * A TV's browser loads the hub once and can sit on it for weeks, so without
 * this a layout, signage URL or tile change saved on the management page -- or
 * a redeploy -- never reaches the screen until someone power-cycles it.
 *
 * Deliberately conservative, because a mistake here reloads every TV at once:
 *   - it never reloads while someone is using the hub (see `hubBusy`) or has
 *     pressed a key in the last QUIET_MS; the change waits until they stop;
 *   - it never reloads a hidden page, e.g. while a streaming app is in front;
 *   - it never reloads more than once per MIN_RELOAD_GAP_MS, remembered across
 *     reloads, so even a version that somehow changed on every poll could not
 *     turn into a reload loop;
 *   - a poll that fails is ignored, so a server restart or a network blip does
 *     nothing.
 *
 * `loaded` is the version the page is showing. Pass null when the config failed
 * to load (e.g. "Display not registered"): the page then reloads as soon as the
 * server answers, so a display comes alive by itself once it is registered.
 */

const POLL_MS = 15_000;
const QUIET_MS = 15_000;
const MIN_RELOAD_GAP_MS = 60_000;
const LAST_RELOAD_KEY = "bsu_hub_last_reload";

/** Set by the hub: true while someone is mid-task (an app, the admin panel, a picker, a warning). */
export const hubBusy = { current: false };

function lastReloadAt(): number {
  try {
    return Number(sessionStorage.getItem(LAST_RELOAD_KEY)) || 0;
  } catch {
    return 0;
  }
}

function markReload(): void {
  try {
    sessionStorage.setItem(LAST_RELOAD_KEY, String(Date.now()));
  } catch {
    // Storage unavailable: the in-memory gap below still applies to this page.
  }
}

export function useConfigWatch(loaded: string | null, enabled: boolean): void {
  // Read the latest loaded version at poll time, not the one captured when the
  // timer started: an admin save re-fetches config in place and must not then
  // trigger a reload for a change the page already has.
  const loadedRef = useRef(loaded);
  loadedRef.current = loaded;

  useEffect(() => {
    if (!enabled) return;

    let lastInput = 0;
    let inFlight = false;
    const onInput = () => {
      lastInput = Date.now();
    };
    const events = ["keydown", "click", "touchstart", "wheel", "mousemove"] as const;
    events.forEach((e) => window.addEventListener(e, onInput, { passive: true }));

    const timer = setInterval(async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const server = await getConfigVersion();
        if (server === null || server === loadedRef.current) return;

        const now = Date.now();
        if (hubBusy.current) return;
        if (document.visibilityState === "hidden") return;
        if (now - lastInput < QUIET_MS) return;
        if (now - lastReloadAt() < MIN_RELOAD_GAP_MS) return;

        markReload();
        window.location.reload();
      } finally {
        inFlight = false;
      }
    }, POLL_MS);

    return () => {
      clearInterval(timer);
      events.forEach((e) => window.removeEventListener(e, onInput));
    };
  }, [enabled]);
}

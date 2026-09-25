import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { publicDir } from "./public-dir";

/**
 * A fingerprint of what a display is showing, so the hub can tell when to reload.
 *
 * The hub reads its config once, when the page loads, and a TV's browser can
 * stay on that page for weeks. It polls this version and reloads itself when it
 * changes, so a layout, signage URL or tile change on the management page reaches
 * the screen without anyone power-cycling it.
 *
 * Two inputs:
 *   - the display's /config payload, serialised with sorted keys, so the same
 *     settings always hash the same whatever order they were stored in;
 *   - the build, so a redeploy is picked up too. Without this, displays keep
 *     running the old JavaScript until someone reloads them by hand.
 *
 * Stability matters more than anything else here: a version that changed on its
 * own would reload every TV on the network, repeatedly. Nothing time-varying may
 * go into the payload this hashes.
 */

/** JSON with object keys sorted at every level; arrays keep their order. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

let cachedBuildId: string | null = null;

/**
 * Identifies the deployed UI build: a hash of the served index.html, which
 * references the content-hashed bundle files and so changes on every build.
 * Read once -- a deploy restarts the service, which is when it can change.
 */
export function buildId(): string {
  if (cachedBuildId !== null) return cachedBuildId;
  try {
    const html = fs.readFileSync(path.join(publicDir(), "index.html"));
    cachedBuildId = crypto.createHash("sha1").update(html).digest("hex").slice(0, 12);
  } catch {
    // No built UI (dev, tests): a fixed value, so the version depends on config alone.
    cachedBuildId = "dev";
  }
  return cachedBuildId;
}

/** Version for a /config payload. Excludes any `version` field already on it. */
export function configVersion(payload: object, build: string = buildId()): string {
  const { version: _ignored, ...rest } = payload as Record<string, unknown>;
  return crypto
    .createHash("sha1")
    .update(`${build}\n${stableStringify(rest)}`)
    .digest("hex")
    .slice(0, 16);
}

/** Test hook: forget the cached build id. */
export function _resetBuildIdForTests(): void {
  cachedBuildId = null;
}

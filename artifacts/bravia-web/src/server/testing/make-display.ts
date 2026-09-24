import type { Display } from "../lib/config";

/**
 * A Display for tests, overridable field by field.
 *
 * Every test file used to build this inline, so each new field on Display broke
 * all of them at once and had to be patched in several places. One definition
 * means adding a field is a single edit here.
 *
 * Defaults describe the common case: a reachable, dry-run Sony.
 */
export function makeDisplay(over: Partial<Display> = {}): Display {
  return {
    hostname: "tv-rsu008-l",
    label: "RSU 008 Left",
    driver: "sony-bravia",
    setId: 1,
    controlPort: null,
    psk: "psk",
    dryRun: true,
    autoSignage: true,
    appSource: null,
    inputs: [],
    apps: [],
    commands: [],
    ipOverride: null,
    controlIpOverride: null,
    resolvedIps: ["10.0.0.5"],
    targetIp: "10.0.0.5",
    ...over,
  };
}

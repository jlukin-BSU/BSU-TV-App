import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { configVersion, stableStringify } from "./config-version";

/**
 * The hub reloads whenever this version changes. So it must change when a
 * setting does, and must NOT change otherwise -- a version that drifted on its
 * own would reload every TV on the network.
 */

const base = {
  device: { hostname: "tv-rsu008-l", label: "RSU 008 Left", ip: "10.0.0.5", dryRun: false },
  tiles: [{ key: "signage", label: "News & Announcements" }, { key: "netflix", label: "Netflix" }],
  inputs: [],
  autoSignage: true,
  idleMs: 300_000,
  layout: "grid",
  help: { show: true, title: "Problem with this TV?", message: "Scan to contact IT Support", qr: null },
  signageUrl: "https://webplayer.optisigns.com/",
};

describe("stability", () => {
  test("the same config gives the same version every time", () => {
    assert.equal(configVersion(base, "b1"), configVersion(base, "b1"));
    assert.equal(configVersion(structuredClone(base), "b1"), configVersion(base, "b1"));
  });

  test("key order does not matter, at any depth", () => {
    const reordered = {
      signageUrl: base.signageUrl,
      help: { qr: null, message: base.help.message, title: base.help.title, show: true },
      layout: base.layout,
      idleMs: base.idleMs,
      autoSignage: base.autoSignage,
      inputs: base.inputs,
      tiles: base.tiles,
      device: { dryRun: false, ip: "10.0.0.5", label: "RSU 008 Left", hostname: "tv-rsu008-l" },
    };
    assert.equal(configVersion(reordered, "b1"), configVersion(base, "b1"));
  });

  test("a version field already on the payload is ignored", () => {
    assert.equal(configVersion({ ...base, version: "anything" }, "b1"), configVersion(base, "b1"));
  });

  test("undefined fields are treated as absent", () => {
    assert.equal(configVersion({ ...base, extra: undefined }, "b1"), configVersion(base, "b1"));
  });
});

describe("sensitivity", () => {
  test("changes when the layout changes", () => {
    assert.notEqual(configVersion({ ...base, layout: "hub" }, "b1"), configVersion(base, "b1"));
  });

  test("changes when the signage URL is set or cleared", () => {
    assert.notEqual(configVersion({ ...base, signageUrl: null }, "b1"), configVersion(base, "b1"));
  });

  test("changes when a tile is hidden or reordered", () => {
    assert.notEqual(configVersion({ ...base, tiles: [base.tiles[0]!] }, "b1"), configVersion(base, "b1"));
    assert.notEqual(
      configVersion({ ...base, tiles: [base.tiles[1]!, base.tiles[0]!] }, "b1"),
      configVersion(base, "b1"),
      "tile order is meaningful, so array order must count",
    );
  });

  test("changes when the idle timeout changes", () => {
    assert.notEqual(configVersion({ ...base, idleMs: 60_000 }, "b1"), configVersion(base, "b1"));
  });

  test("changes with the build, so a redeploy reaches the screens", () => {
    assert.notEqual(configVersion(base, "b2"), configVersion(base, "b1"));
  });
});

test("stableStringify sorts keys but keeps array order", () => {
  assert.equal(stableStringify({ b: 1, a: [3, 1, 2] }), '{"a":[3,1,2],"b":1}');
});

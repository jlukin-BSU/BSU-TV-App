import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildingOf, buildingsIn, displaysInBuilding } from "./building";
import type { Display } from "./config";

/**
 * Characterisation tests for the building-code parser.
 *
 * These exist to pin current behaviour before the display/streamer/controller
 * refactor. The parser has already been wrong once -- it originally took the
 * leading letters, which turned every "tv-" prefixed host into building "TV" --
 * so the prefix cases below are regressions, not hypotheticals.
 */

function display(hostname: string): Display {
  return {
    hostname,
    label: hostname,
    psk: "",
    dryRun: true,
    autoSignage: true,
    appSource: null,
    inputs: [],
    apps: [],
    commands: [],
    ipOverride: null,
    controlIpOverride: null,
    resolvedIps: [],
    targetIp: null,
  };
}

describe("buildingOf", () => {
  test("takes the letters immediately before the digits, not the leading letters", () => {
    assert.equal(buildingOf("tv-rsu008-l"), "RSU");
    assert.equal(buildingOf("tv-max210"), "MAX");
  });

  test("works without a prefix", () => {
    assert.equal(buildingOf("RSU101"), "RSU");
    assert.equal(buildingOf("bur104"), "BUR");
  });

  test("uppercases so the code is a stable group key", () => {
    assert.equal(buildingOf("rsu008"), "RSU");
    assert.equal(buildingOf("RsU008"), "RSU");
  });

  test("falls back to OTHER when there is no letters-then-digit run", () => {
    assert.equal(buildingOf("signage"), "OTHER");
    assert.equal(buildingOf("12345"), "OTHER");
    assert.equal(buildingOf(""), "OTHER");
  });

  test("stops at the first digit run rather than a later one", () => {
    assert.equal(buildingOf("tv-rsu008-l2"), "RSU");
  });
});

describe("buildingsIn", () => {
  test("is de-duplicated and sorted", () => {
    const displays = ["tv-max210", "tv-rsu008-l", "tv-rsu008-r", "signage"].map(display);
    assert.deepEqual(buildingsIn(displays), ["MAX", "OTHER", "RSU"]);
  });

  test("is empty for no displays", () => {
    assert.deepEqual(buildingsIn([]), []);
  });
});

describe("displaysInBuilding", () => {
  const displays = ["tv-rsu008-l", "tv-rsu008-r", "tv-max210"].map(display);

  test("matches case-insensitively and ignores surrounding space", () => {
    assert.equal(displaysInBuilding(displays, "rsu").length, 2);
    assert.equal(displaysInBuilding(displays, "  RSU  ").length, 2);
  });

  test("returns nothing for an unknown building rather than everything", () => {
    assert.deepEqual(displaysInBuilding(displays, "ZZZ"), []);
  });
});

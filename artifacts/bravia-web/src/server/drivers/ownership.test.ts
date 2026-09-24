import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { appSourceFor, appsFor, driverFor, supports, DriverError } from "./index";
import type { Display } from "../lib/config";

/**
 * What a panel *can* do and what an installation *uses it for* are separate.
 *
 * These tests exist to stop that separation eroding. The cases that matter are
 * the ones that do not exist yet: a Sony paired with a streaming device (capable
 * of apps, but should not own them), a Sony model that drops the app platform,
 * and an LG that gains one. If someone reintroduces "if Sony" reasoning, the
 * pairing case below is what fails.
 */

function display(over: Partial<Display> = {}): Display {
  return {
    hostname: "tv-rsu008-l",
    label: "RSU 008 Left",
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

describe("capability declaration", () => {
  test("the driver declares what the model can do", () => {
    const d = display();
    for (const cap of ["power", "input", "volume", "mute", "screen", "apps"] as const) {
      assert.equal(supports(d, cap), true, `Sony should support ${cap}`);
    }
  });

  test("app control is implemented exactly when the capability is declared", () => {
    const driver = driverFor(display());
    assert.equal(driver.supports.has("apps"), Boolean(driver.apps));
  });
});

describe("app ownership", () => {
  test("defaults to the panel when it is capable and nothing is configured", () => {
    assert.equal(appSourceFor(display({ appSource: null })), "display");
    assert.doesNotThrow(() => appsFor(display({ appSource: null })));
  });

  test("a capable panel paired with a streamer yields ownership to it", () => {
    const paired = display({ appSource: "streamer" });

    assert.equal(appSourceFor(paired), "streamer");
    // Capability is unchanged -- the panel could still do it.
    assert.equal(supports(paired, "apps"), true);
    // But asking the panel to is a configuration error, not a silent fallback.
    assert.throws(() => appsFor(paired), DriverError);
  });

  test("an explicit 'display' setting is honoured", () => {
    assert.equal(appSourceFor(display({ appSource: "display" })), "display");
    assert.doesNotThrow(() => appsFor(display({ appSource: "display" })));
  });

  test("refusing to launch on the panel explains which device owns it", () => {
    const err = (() => {
      try {
        appsFor(display({ appSource: "streamer" }));
        return null;
      } catch (e) {
        return e as DriverError;
      }
    })();

    assert.ok(err instanceof DriverError);
    assert.match(err.message, /streaming device/i);
    assert.match(err.message, /tv-rsu008-l/);
  });

  test("other capabilities are unaffected by where apps live", () => {
    const paired = display({ appSource: "streamer" });
    for (const cap of ["power", "input", "volume", "mute", "screen"] as const) {
      assert.equal(supports(paired, cap), true, `${cap} still belongs to the panel`);
    }
  });
});

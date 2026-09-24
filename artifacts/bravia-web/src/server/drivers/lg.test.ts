import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { lgDriver } from "./lg";
import { DriverError } from "./types";
import { makeDisplay } from "../testing/make-display";

/**
 * Tests for the LG commercial driver, against a fake panel on a local socket.
 *
 * The wire format is unforgiving and the failure mode is silent -- a wrong
 * nibble switches to the wrong input rather than erroring -- so the encoding is
 * asserted byte for byte against the command reference in the UR340C manual.
 */

let server: net.Server;
let port = 0;
/** Raw command strings the fake panel received. */
let received: string[] = [];
/** Reply the fake panel sends next, or null to stay silent (timeout case). */
let reply: string | null = "a 01 OK01x";

before(async () => {
  server = net.createServer((socket) => {
    socket.on("data", (chunk) => {
      received.push(chunk.toString("ascii"));
      if (reply !== null) socket.write(reply, "ascii");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as net.AddressInfo).port;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  received = [];
  reply = "a 01 OK01x";
});

const display = (over: Parameters<typeof makeDisplay>[0] = {}) =>
  makeDisplay({
    hostname: "tv-rsu012",
    label: "RSU 012",
    driver: "lg-commercial",
    controlPort: port,
    psk: "",
    dryRun: false,
    resolvedIps: ["127.0.0.1"],
    targetIp: "127.0.0.1",
    ...over,
  });

describe("capabilities", () => {
  test("declares no app platform, so apps fall to a streaming device", () => {
    assert.equal(lgDriver.supports.has("apps"), false);
    assert.equal(lgDriver.apps, undefined);
  });

  test("still owns power, input, volume, mute and screen", () => {
    for (const cap of ["power", "input", "volume", "mute", "screen"] as const) {
      assert.equal(lgDriver.supports.has(cap), true, `expected ${cap}`);
    }
  });

  test("needs no pre-shared key -- the protocol has no auth", () => {
    assert.equal(lgDriver.requiresPsk, false);
  });
});

describe("command encoding", () => {
  test("power on and off are ka 01 / ka 00", async () => {
    await lgDriver.setPower(display(), true);
    assert.equal(received[0], "ka 01 01\r");

    received = [];
    await lgDriver.setPower(display(), false);
    assert.equal(received[0], "ka 01 00\r");
  });

  test("volume is kf with a two-digit hex level", async () => {
    await lgDriver.setVolume(display(), 30);
    assert.equal(received[0], "kf 01 1E\r");

    received = [];
    await lgDriver.setVolume(display(), 100);
    assert.equal(received[0], "kf 01 64\r");
  });

  test("volume is clamped and rounded rather than sent out of range", async () => {
    await lgDriver.setVolume(display(), 140);
    assert.equal(received[0], "kf 01 64\r");

    received = [];
    await lgDriver.setVolume(display(), -5);
    assert.equal(received[0], "kf 01 00\r");
  });

  test("mute is inverted: ke 00 mutes, ke 01 unmutes", async () => {
    // Straight from the manual. Getting this backwards is the obvious bug.
    await lgDriver.setMute(display(), true);
    assert.equal(received[0], "ke 01 00\r");

    received = [];
    await lgDriver.setMute(display(), false);
    assert.equal(received[0], "ke 01 01\r");
  });

  test("HDMI inputs are xb 90..93", async () => {
    for (const [port_, code] of [[1, "90"], [2, "91"], [3, "92"], [4, "93"]] as const) {
      received = [];
      await lgDriver.setInput(display(), port_);
      assert.equal(received[0], `xb 01 ${code}\r`);
    }
  });

  test("an out-of-range HDMI port is refused, not silently encoded", async () => {
    await assert.rejects(() => lgDriver.setInput(display(), 5), DriverError);
    await assert.rejects(() => lgDriver.setInput(display(), 0), DriverError);
    assert.equal(received.length, 0);
  });

  test("screen off blanks the panel but leaves it powered and reachable", async () => {
    await lgDriver.setScreenState(display(), "pictureOff");
    assert.equal(received[0], "kd 01 01\r");

    received = [];
    await lgDriver.setScreenState(display(), "pictureOn");
    assert.equal(received[0], "kd 01 00\r");
  });

  test("standby is a real power off, not a blank", async () => {
    await lgDriver.setScreenState(display(), "standby");
    assert.equal(received[0], "ka 01 00\r");
  });

  test("the set id is encoded as two hex digits", async () => {
    await lgDriver.setPower(display({ setId: 12 }), true);
    assert.equal(received[0], "ka 0C 01\r");
  });
});

describe("response parsing", () => {
  test("power status reads ka FF", async () => {
    reply = "a 01 OK01x";
    assert.equal(await lgDriver.getPowerStatus(display()), "active");
    assert.equal(received[0], "ka 01 FF\r");

    reply = "a 01 OK00x";
    assert.equal(await lgDriver.getPowerStatus(display()), "standby");
  });

  test("an unrecognised power value is 'unknown', not a throw", async () => {
    reply = "a 01 OK7Fx";
    assert.equal(await lgDriver.getPowerStatus(display()), "unknown");
  });

  test("volume decodes from hex and mute is read inverted", async () => {
    reply = "f 01 OK1Ex"; // 0x1E = 30, and mute reply "1E" is not "00" => not muted
    const info = await lgDriver.getVolume(display());
    assert.equal(info?.volume, 30);
    assert.equal(info?.mute, false);
  });

  test("mute reading 00 means muted", async () => {
    reply = "e 01 OK00x";
    const info = await lgDriver.getVolume(display());
    assert.equal(info?.mute, true);
  });

  test("current input maps back to an HDMI port, shaped like Sony's", async () => {
    reply = "b 01 OK91x";
    const content = await lgDriver.getPlayingContent(display());
    assert.equal(content?.uri, "extInput:hdmi?port=2");
    assert.equal(content?.source, "extInput:hdmi");
  });

  test("a non-HDMI source is reported rather than treated as nothing playing", async () => {
    reply = "b 01 OK00x"; // DTV
    const content = await lgDriver.getPlayingContent(display());
    assert.ok(content);
    assert.match(content.uri, /^lgInput:/);
  });

  test("NG is a failure", async () => {
    reply = "a 01 NG01x";
    await assert.rejects(() => lgDriver.setPower(display(), true), DriverError);
  });

  test("an unparseable reply is a failure, not a silent success", async () => {
    reply = "garbage-without-structurex";
    await assert.rejects(() => lgDriver.setPower(display(), true), DriverError);
  });
});

describe("failure modes", () => {
  test("an unresolved hostname fails before connecting", async () => {
    await assert.rejects(
      () => lgDriver.setPower(display({ targetIp: null, resolvedIps: [] }), true),
      DriverError,
    );
    assert.equal(received.length, 0);
  });

  test("a refused connection names the display and address", async () => {
    // Port 1 on loopback: nothing listening.
    const err = await lgDriver
      .setPower(display({ controlPort: 1 }), true)
      .then(() => null, (e: unknown) => e);

    assert.ok(err instanceof DriverError);
    assert.match(err.message, /tv-rsu012/);
  });

  test("dry run sends nothing and still answers", async () => {
    const status = await lgDriver.getPowerStatus(display({ dryRun: true }));
    assert.equal(received.length, 0);
    assert.equal(status, "active");
  });
});

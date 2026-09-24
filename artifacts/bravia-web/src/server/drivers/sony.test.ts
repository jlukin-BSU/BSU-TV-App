import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DriverError } from "./types";
import { sonyDriver } from "./sony";
import { makeDisplay } from "../testing/make-display";

/**
 * Characterisation tests for the Sony BRAVIA driver.
 *
 * Written before the display/streamer/controller refactor, to pin the wire
 * contract and -- more importantly -- the error handling. Sony answers HTTP 200
 * even when a command failed, putting the failure in an `error` tuple in the
 * body, so "it returned 200" is not success. That behaviour is easy to lose in
 * a refactor and hard to notice afterwards, which is exactly why it is tested.
 */

const display = (over: Parameters<typeof makeDisplay>[0] = {}) =>
  makeDisplay({ psk: "secret-psk", dryRun: false, ...over });

interface Captured {
  url: string;
  init: RequestInit;
}

const realFetch = globalThis.fetch;
let calls: Captured[] = [];

/** Stub global fetch with a canned response. */
function stubFetch(status: number, body: string, statusText = "") {
  calls = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(body, { status, statusText });
  }) as typeof fetch;
}

function stubNetworkFailure(err: Error) {
  calls = [];
  globalThis.fetch = (async () => {
    throw err;
  }) as typeof fetch;
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("request shape", () => {
  test("posts JSON-RPC to /sony/<service> on the resolved target IP", async () => {
    stubFetch(200, JSON.stringify({ result: [], id: 20 }));
    await sonyDriver.setInput(display(), 3);

    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, "http://10.0.0.5/sony/avContent");
    assert.equal(calls[0]!.init.method, "POST");
  });

  test("authenticates with the per-display PSK header", async () => {
    stubFetch(200, JSON.stringify({ result: [], id: 20 }));
    await sonyDriver.setInput(display({ psk: "abc123" }), 3);

    const headers = calls[0]!.init.headers as Record<string, string>;
    assert.equal(headers["X-Auth-PSK"], "abc123");
    assert.equal(headers["Content-Type"], "application/json");
  });

  test("sends method, id, params and version 1.0", async () => {
    stubFetch(200, JSON.stringify({ result: [], id: 20 }));
    await sonyDriver.setInput(display(), 4);

    const body = JSON.parse(String(calls[0]!.init.body));
    assert.equal(body.method, "setPlayContent");
    assert.equal(body.version, "1.0");
    assert.deepEqual(body.params, [{ uri: "extInput:hdmi?port=4" }]);
    assert.equal(typeof body.id, "number");
  });

  test("targets the control override when one is set", async () => {
    stubFetch(200, JSON.stringify({ result: [], id: 20 }));
    await sonyDriver.setInput(display({ targetIp: "127.0.0.1" }), 3);
    assert.equal(calls[0]!.url, "http://127.0.0.1/sony/avContent");
  });
});

describe("error handling", () => {
  test("a Sony error tuple in a 200 body is a failure, not a success", async () => {
    stubFetch(200, JSON.stringify({ error: [7, "Illegal State"], id: 20 }));
    const err = await sonyDriver.setInput(display(), 3).then(
      () => null,
      (e: unknown) => e,
    );

    assert.ok(err instanceof DriverError, "expected a DriverError");
    assert.equal(err.code, 7);
    assert.match(err.message, /Illegal State/);
  });

  test("403 is reported as a PSK problem", async () => {
    stubFetch(403, "");
    const err = await sonyDriver.setInput(display(), 3).then(
      () => null,
      (e: unknown) => e,
    );

    assert.ok(err instanceof DriverError);
    assert.equal(err.code, 403);
    assert.match(err.message, /Pre-Shared Key/i);
  });

  test("other non-2xx statuses carry the status code", async () => {
    stubFetch(503, "", "Service Unavailable");
    const err = await sonyDriver.setInput(display(), 3).then(
      () => null,
      (e: unknown) => e,
    );

    assert.ok(err instanceof DriverError);
    assert.equal(err.code, 503);
  });

  test("a non-JSON body is an error, not a silent empty result", async () => {
    stubFetch(200, "<html>not json</html>");
    await assert.rejects(() => sonyDriver.setInput(display(), 3), DriverError);
  });

  test("an unresolved hostname fails before any request is attempted", async () => {
    stubFetch(200, JSON.stringify({ result: [] }));
    const err = await sonyDriver.setInput(display({ targetIp: null, resolvedIps: [] }), 3).then(
      () => null,
      (e: unknown) => e,
    );

    assert.ok(err instanceof DriverError);
    assert.match(err.message, /resolve/i);
    assert.equal(calls.length, 0, "must not attempt a request with no target");
  });

  test("a network failure names the display and the address", async () => {
    stubNetworkFailure(new Error("ECONNREFUSED"));
    const err = await sonyDriver.setInput(display(), 3).then(
      () => null,
      (e: unknown) => e,
    );

    assert.ok(err instanceof DriverError);
    assert.match(err.message, /tv-rsu008-l/);
    assert.match(err.message, /10\.0\.0\.5/);
  });
});

describe("response parsing", () => {
  test("getPowerStatus maps the reported status", async () => {
    stubFetch(200, JSON.stringify({ result: [{ status: "active" }], id: 50 }));
    assert.equal(await sonyDriver.getPowerStatus(display()), "active");

    stubFetch(200, JSON.stringify({ result: [{ status: "standby" }], id: 50 }));
    assert.equal(await sonyDriver.getPowerStatus(display()), "standby");
  });

  test("getPowerStatus is 'unknown' rather than throwing on an unexpected value", async () => {
    stubFetch(200, JSON.stringify({ result: [{ status: "warming" }], id: 50 }));
    assert.equal(await sonyDriver.getPowerStatus(display()), "unknown");
  });

  test("getApplicationList drops entries with no uri", async () => {
    stubFetch(
      200,
      JSON.stringify({
        result: [[{ title: "Netflix", uri: "com.netflix.ninja" }, { title: "Broken" }, null]],
        id: 60,
      }),
    );

    const apps = await sonyDriver.apps!.list(display());
    assert.deepEqual(apps, [{ title: "Netflix", uri: "com.netflix.ninja" }]);
  });

  test("getApplicationList tolerates a non-array result", async () => {
    stubFetch(200, JSON.stringify({ result: [{}], id: 60 }));
    assert.deepEqual(await sonyDriver.apps!.list(display()), []);
  });
});

describe("dry run", () => {
  test("sends nothing and still returns a plausible payload", async () => {
    stubFetch(200, JSON.stringify({ result: [] }));
    const status = await sonyDriver.getPowerStatus(display({ dryRun: true }));

    assert.equal(calls.length, 0, "dry run must not touch the network");
    assert.equal(status, "active");
  });
});

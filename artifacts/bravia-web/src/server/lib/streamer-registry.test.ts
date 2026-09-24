import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { StreamerRegistry, StreamerReportSchema, statusFor } from "./streamer-registry";
import type { StoredApk } from "./apk-store";

/**
 * Verification is the device's report compared with the store. These cover the
 * comparison and the report handling; nothing here assumes an install worked.
 */

function apk(packageName: string, versionCode: number): StoredApk {
  return { packageName, versionCode, versionName: String(versionCode), sha256: "a".repeat(64), size: 1, uploadedAt: "" };
}

function report(over: Record<string, unknown> = {}) {
  return StreamerReportSchema.parse({ deviceId: "dev-1", ...over });
}

describe("statusFor", () => {
  const stored = [apk("com.optisigns.playe1", 10), apk("edu.bridgew.tvkiosk", 2)];

  test("current, outdated and missing", () => {
    const s = statusFor({ installed: { "com.optisigns.playe1": { versionCode: 10, versionName: "10" } } }, stored);
    assert.equal(s.find((a) => a.packageName === "com.optisigns.playe1")!.state, "current");
    assert.equal(s.find((a) => a.packageName === "edu.bridgew.tvkiosk")!.state, "missing");

    const old = statusFor({ installed: { "com.optisigns.playe1": { versionCode: 9, versionName: "9" } } }, stored);
    assert.equal(old[0]!.state, "outdated");
  });

  test("a device ahead of the store is reported as such, not as outdated", () => {
    const s = statusFor({ installed: { "com.optisigns.playe1": { versionCode: 11, versionName: "11" } } }, stored);
    assert.equal(s[0]!.state, "ahead");
  });

  test("an empty store yields no statuses", () => {
    assert.deepEqual(statusFor({ installed: {} }, []), []);
  });

  test("uses friendly labels", () => {
    assert.equal(statusFor({ installed: {} }, stored)[0]!.label, "OptiSigns");
  });
});

describe("report validation", () => {
  test("a minimal report gets safe defaults", () => {
    const r = report();
    assert.equal(r.deviceOwner, false);
    assert.deepEqual(r.installed, {});
    assert.equal(r.lastInstall, null);
  });

  test("unknown fields are rejected rather than stored", () => {
    assert.equal(StreamerReportSchema.safeParse({ deviceId: "x", evil: true }).success, false);
  });

  test("a report without a device id is rejected", () => {
    assert.equal(StreamerReportSchema.safeParse({}).success, false);
  });
});

describe("StreamerRegistry", () => {
  const file = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "streamers-")), "streamers.json");

  test("records the source IP the report arrived from, not the one it claims", () => {
    const reg = new StreamerRegistry(file());
    const rec = reg.record(report({ ip: "1.2.3.4" }), "10.30.14.62");
    assert.equal(rec.sourceIp, "10.30.14.62");
    assert.equal(rec.ip, "1.2.3.4");
  });

  test("a device re-reporting updates in place", () => {
    const reg = new StreamerRegistry(file());
    reg.record(report({ appVersion: "0.1.0" }), "10.0.0.1");
    reg.record(report({ appVersion: "0.2.0" }), "10.0.0.1");
    assert.equal(reg.list().length, 1);
    assert.equal(reg.list()[0]!.appVersion, "0.2.0");
  });

  test("state survives a restart", () => {
    const f = file();
    new StreamerRegistry(f).record(report(), "10.0.0.1");
    assert.equal(new StreamerRegistry(f).list().length, 1);
  });

  test("forget removes a device", () => {
    const reg = new StreamerRegistry(file());
    reg.record(report(), "10.0.0.1");
    assert.equal(reg.remove("dev-1"), true);
    assert.equal(reg.list().length, 0);
  });
});

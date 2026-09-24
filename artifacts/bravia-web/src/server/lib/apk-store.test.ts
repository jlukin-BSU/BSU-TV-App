import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { ApkStore, ApkStoreError, labelFor, SHELL_PACKAGE } from "./apk-store";
import { makeApkFile, type ManifestSpec } from "../testing/make-apk";

/**
 * The store's rules exist because Android's do: it will not downgrade an
 * installed app, and it will not install the same versionCode as an update.
 * Publishing either would leave streamers stuck, so the store refuses them.
 */

let dir: string;
let store: ApkStore;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "apkstore-"));
  store = new ApkStore(dir);
});

/** Stage an APK in the store's temp area the way the upload route does. */
function upload(spec: ManifestSpec, padding = 64) {
  const bytes = fs.readFileSync(makeApkFile(spec, { padding }));
  const tmp = store.tempPath();
  fs.writeFileSync(tmp, bytes);
  return store.ingest(tmp, crypto.createHash("sha256").update(bytes).digest("hex"), bytes.length);
}

describe("ingest", () => {
  test("stores the APK under its checksum and records its identity", () => {
    const e = upload({ packageName: "com.optisigns.playe1", versionCode: 500501934, versionName: "5.19.34" });
    assert.equal(e.packageName, "com.optisigns.playe1");
    assert.equal(e.versionCode, 500501934);
    assert.ok(fs.existsSync(store.filePath(e.sha256)));
    assert.equal(store.list().length, 1);
  });

  test("a newer build replaces the old one and deletes its file", () => {
    const v1 = upload({ packageName: "a.b", versionCode: 1 });
    const v2 = upload({ packageName: "a.b", versionCode: 2 });
    assert.equal(store.list().length, 1);
    assert.equal(store.list()[0]!.versionCode, 2);
    assert.ok(!fs.existsSync(store.filePath(v1.sha256)));
    assert.ok(fs.existsSync(store.filePath(v2.sha256)));
  });

  test("an older build is refused -- Android will not downgrade", () => {
    upload({ packageName: "a.b", versionCode: 5 });
    assert.throws(() => upload({ packageName: "a.b", versionCode: 4 }), ApkStoreError);
    assert.equal(store.list()[0]!.versionCode, 5);
  });

  test("the same versionCode with different contents is refused", () => {
    upload({ packageName: "a.b", versionCode: 5 }, 64);
    assert.throws(() => upload({ packageName: "a.b", versionCode: 5 }, 128), /bump the versionCode/);
  });

  test("re-uploading identical bytes is a no-op, not an error", () => {
    const a = upload({ packageName: "a.b", versionCode: 5 });
    const b = upload({ packageName: "a.b", versionCode: 5 });
    assert.equal(a.sha256, b.sha256);
    assert.equal(store.list().length, 1);
  });

  test("a non-APK is refused and its temp file cleaned up", () => {
    const tmp = store.tempPath();
    fs.writeFileSync(tmp, "not an apk" + " ".repeat(64));
    assert.throws(() => store.ingest(tmp, "0".repeat(64), 10), ApkStoreError);
    assert.ok(!fs.existsSync(tmp));
  });

  test("different packages coexist", () => {
    upload({ packageName: "com.optisigns.playe1", versionCode: 1 });
    upload({ packageName: SHELL_PACKAGE, versionCode: 2 });
    assert.equal(store.list().length, 2);
  });
});

describe("persistence", () => {
  test("the index survives a restart", () => {
    const e = upload({ packageName: "a.b", versionCode: 3 });
    assert.equal(new ApkStore(dir).bySha(e.sha256)?.versionCode, 3);
  });

  test("an entry whose file vanished is not advertised after restart", () => {
    const e = upload({ packageName: "a.b", versionCode: 3 });
    fs.rmSync(store.filePath(e.sha256));
    assert.equal(new ApkStore(dir).list().length, 0);
  });
});

describe("remove", () => {
  test("drops the entry and its file", () => {
    const e = upload({ packageName: "a.b", versionCode: 1 });
    assert.equal(store.remove("a.b"), true);
    assert.equal(store.list().length, 0);
    assert.ok(!fs.existsSync(store.filePath(e.sha256)));
  });

  test("reports false for an unknown package", () => {
    assert.equal(store.remove("nope"), false);
  });
});

test("known packages get friendly labels", () => {
  assert.equal(labelFor("com.optisigns.playe1"), "OptiSigns");
  assert.equal(labelFor(SHELL_PACKAGE), "BSU TV");
  assert.equal(labelFor("com.other.app"), "com.other.app");
});

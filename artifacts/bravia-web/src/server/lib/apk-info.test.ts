import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readApkInfo, ApkError, _internal } from "./apk-info";
import { buildManifestAxml, makeApkFile } from "../testing/make-apk";

/**
 * The server reads package/version from uploaded APKs itself, with no Android
 * tools. Getting it wrong would publish the wrong version to the fleet, so the
 * formats real APKs use are covered: UTF-8 and UTF-16 string pools, deflated
 * and stored entries, and manifests whose attribute names were stripped.
 *
 * Also cross-checked by hand against aapt2 on real APKs (OptiSigns 5.18.25 and
 * 5.19.34, the old BSU TV Hub, this shell, and an obfuscated Xfinity build).
 */

describe("readApkInfo", () => {
  test("reads package, versionCode and versionName", () => {
    const info = readApkInfo(makeApkFile({ packageName: "com.optisigns.playe1", versionCode: 500501934, versionName: "5.19.34" }));
    assert.deepEqual(info, { packageName: "com.optisigns.playe1", versionCode: 500501934, versionName: "5.19.34" });
  });

  test("handles stored (uncompressed) manifests as well as deflated", () => {
    const info = readApkInfo(makeApkFile({ packageName: "a.b", versionCode: 3 }, { deflate: false }));
    assert.equal(info.versionCode, 3);
  });

  test("handles UTF-8 string pools", () => {
    const info = readApkInfo(makeApkFile({ packageName: "edu.bridgew.tvkiosk", versionCode: 2, versionName: "0.2.0", utf8: true }));
    assert.equal(info.packageName, "edu.bridgew.tvkiosk");
    assert.equal(info.versionName, "0.2.0");
  });

  test("falls back to resource ids when attribute names are stripped", () => {
    const info = readApkInfo(makeApkFile({ packageName: "x.y", versionCode: 77, versionName: "7.7", stripAttrNames: true }));
    assert.equal(info.versionCode, 77);
    assert.equal(info.versionName, "7.7");
  });

  test("versionName is optional", () => {
    assert.equal(readApkInfo(makeApkFile({ packageName: "x.y", versionCode: 1 })).versionName, null);
  });

  test("a manifest with no versionCode is rejected, not published as version 0", () => {
    assert.throws(() => readApkInfo(makeApkFile({ packageName: "x.y" })), ApkError);
  });

  test("a file that is not a ZIP is rejected", () => {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "apk-")), "junk.apk");
    fs.writeFileSync(f, "definitely not a zip file" + " ".repeat(64));
    assert.throws(() => readApkInfo(f), ApkError);
  });

  test("text XML where binary XML is expected is rejected", () => {
    assert.throws(() => _internal.parseManifest(Buffer.from("<manifest package=\"x\"/>")), ApkError);
  });

  test("the binary manifest parses without the ZIP layer", () => {
    const info = _internal.parseManifest(buildManifestAxml({ packageName: "p.q", versionCode: 9 }));
    assert.equal(info.packageName, "p.q");
  });
});

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeQrSvg, normalizeQrLink, QrLinkError, QR_LINK_MAX } from "./qr";
import { PresentationError, PresentationStore, presentationViewFor } from "./presentation";

/**
 * The help card's QR can be generated from a link instead of uploaded.
 *
 * There is no QR reader on the build machines, so these tests cannot prove a
 * code scans -- that is the `qrcode` library's job, and the final check is a
 * phone camera on the management page. What they do prove: the output is an
 * inert SVG safe to serve from /icons, it goes through the same storage as an
 * upload, and the stored link always describes the image actually shown.
 */

const LINK = "https://example.org/it-help?ticket=new";

describe("makeQrSvg", () => {
  test("produces a plain SVG: shapes only, no script or links", async () => {
    const svg = await makeQrSvg(LINK);
    assert.match(svg, /^<svg[\s>]/);
    assert.match(svg, /<\/svg>\s*$/);
    assert.match(svg, /<path/);
    assert.doesNotMatch(svg, /<script|foreignObject|javascript:|\son[a-z]+=|href=/i);
  });

  test("is deterministic, so the stored file dedupes across displays", async () => {
    assert.equal(await makeQrSvg(LINK), await makeQrSvg(LINK));
  });

  test("different links give different codes", async () => {
    assert.notEqual(await makeQrSvg(LINK), await makeQrSvg("https://example.org/other"));
  });
});

describe("normalizeQrLink", () => {
  test("accepts https, http and mailto", () => {
    assert.equal(normalizeQrLink("  https://example.org/other  "), "https://example.org/other");
    assert.doesNotThrow(() => normalizeQrLink("http://example.org/x"));
    assert.doesNotThrow(() => normalizeQrLink("mailto:helpdesk@example.org"));
  });

  test("rejects other schemes, bare text, blanks and overlong links", () => {
    assert.throws(() => normalizeQrLink("javascript:alert(1)"), QrLinkError);
    assert.throws(() => normalizeQrLink("ftp://example.org/"), QrLinkError);
    assert.throws(() => normalizeQrLink("www.bridgew.edu"), QrLinkError, "no scheme");
    assert.throws(() => normalizeQrLink("   "), QrLinkError);
    assert.throws(() => normalizeQrLink("https://example.org/" + "a".repeat(QR_LINK_MAX)), QrLinkError);
  });
});

describe("PresentationStore.setQrFromLink", () => {
  let file: string;
  let icons: string;
  beforeEach(() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qrlink-"));
    file = path.join(dir, "presentation.json");
    icons = path.join(dir, "icons");
  });
  const fresh = () => new PresentationStore(file, icons);
  const PNG_1PX =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

  test("stores an SVG in the icons dir, exactly like an upload", async () => {
    const p = await fresh().setQrFromLink("tv-a", LINK);
    assert.match(p.help.qrUrl ?? "", /^\/icons\/qr-[0-9a-f]{16}\.svg$/);
    const onDisk = fs.readFileSync(path.join(icons, path.basename(p.help.qrUrl!)), "utf8");
    assert.match(onDisk, /^<svg/);
  });

  test("remembers the link, and it survives a restart", async () => {
    await fresh().setQrFromLink("tv-a", LINK);
    assert.equal(presentationViewFor(fresh(), "tv-a").helpQrLink, LINK);
  });

  test("uploading an image afterwards drops the link, which no longer describes it", async () => {
    const s = fresh();
    await s.setQrFromLink("tv-a", LINK);
    s.setQr("tv-a", PNG_1PX);
    assert.equal(presentationViewFor(s, "tv-a").helpQrLink, "");
  });

  test("removing the QR drops the link too", async () => {
    const s = fresh();
    await s.setQrFromLink("tv-a", LINK);
    s.clearQr("tv-a");
    const v = presentationViewFor(s, "tv-a");
    assert.equal(v.helpQrUrl, null);
    assert.equal(v.helpQrLink, "");
  });

  test("regenerating from a new link replaces the old file", async () => {
    const s = fresh();
    const first = path.basename((await s.setQrFromLink("tv-a", LINK)).help.qrUrl!);
    await s.setQrFromLink("tv-a", "https://example.org/other");
    assert.ok(!fs.existsSync(path.join(icons, first)), "the unused old QR should be deleted");
  });

  test("a bad link is a PresentationError (a 400), and changes nothing", async () => {
    const s = fresh();
    await assert.rejects(() => s.setQrFromLink("tv-a", "not a link"), PresentationError);
    assert.equal(presentationViewFor(s, "tv-a").helpQrUrl, null);
  });
});

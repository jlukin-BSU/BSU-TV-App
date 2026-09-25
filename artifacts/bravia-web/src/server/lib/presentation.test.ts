import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PresentationError, PresentationStore, normalizeSignageUrl } from "./presentation";
import { SettingsSaveSchema } from "./settings";
import { HELP_MESSAGE_DEFAULT, HELP_TITLE_DEFAULT } from "../../shared/catalog";

/**
 * Layout / help card / signage URL per display. The property that matters most
 * for the live Sony displays: a display with no entry must come out as the
 * original tile grid, and nothing in this file may break the older settings.
 */

const PNG_1PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PNG_OTHER =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

let dir: string;
let file: string;
let icons: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "presentation-"));
  file = path.join(dir, "presentation.json");
  icons = path.join(dir, "icons");
});

const fresh = () => new PresentationStore(file, icons);

describe("defaults", () => {
  test("a display with no entry gets the original tile grid", () => {
    const p = fresh().get("tv-a");
    assert.equal(p.layout, "hub");
    assert.deepEqual(p.help, { show: true, title: HELP_TITLE_DEFAULT, message: HELP_MESSAGE_DEFAULT, qrUrl: null });
    assert.equal(p.signageUrl, null);
  });

  test("a missing file writes nothing until something is saved", () => {
    fresh().get("tv-a");
    assert.equal(fs.existsSync(file), false);
  });

  test("an empty patch does not create an entry", () => {
    fresh().update("tv-a", {});
    assert.equal(fs.existsSync(file), false);
  });
});

describe("update", () => {
  test("persists layout, help text and signage URL", () => {
    fresh().update("tv-a", {
      layout: "guide",
      helpShow: false,
      helpTitle: "Need help?",
      helpMessage: "Scan to contact ResNet",
      signageUrl: "https://virtualscreen.example.com/#abc",
    });
    const p = fresh().get("tv-a");
    assert.equal(p.layout, "guide");
    assert.deepEqual(p.help, { show: false, title: "Need help?", message: "Scan to contact ResNet", qrUrl: null });
    assert.equal(p.signageUrl, "https://virtualscreen.example.com/#abc");
  });

  test("blank help text falls back to the defaults", () => {
    const s = fresh();
    s.update("tv-a", { helpTitle: "X", helpMessage: "Y" });
    s.update("tv-a", { helpTitle: "  ", helpMessage: "" });
    assert.equal(s.get("tv-a").help.title, HELP_TITLE_DEFAULT);
    assert.equal(s.get("tv-a").help.message, HELP_MESSAGE_DEFAULT);
  });

  test("an empty signage URL clears it", () => {
    const s = fresh();
    s.update("tv-a", { signageUrl: "https://a.example.com/" });
    s.update("tv-a", { signageUrl: "" });
    assert.equal(s.get("tv-a").signageUrl, null);
  });

  test("a rejected URL leaves the stored entry unchanged", () => {
    const s = fresh();
    s.update("tv-a", { layout: "menu" });
    assert.throws(() => s.update("tv-a", { layout: "grid", signageUrl: "http://plain.example.com/" }), PresentationError);
    assert.equal(fresh().get("tv-a").layout, "menu");
  });

  test("displays are independent", () => {
    const s = fresh();
    s.update("tv-a", { layout: "backdrop" });
    assert.equal(s.get("tv-b").layout, "hub");
  });
});

describe("normalizeSignageUrl", () => {
  test("accepts https, rejects everything else", () => {
    assert.equal(normalizeSignageUrl(" https://x.example.com/p "), "https://x.example.com/p");
    assert.equal(normalizeSignageUrl(""), null);
    assert.throws(() => normalizeSignageUrl("http://x.example.com/"), PresentationError);
    assert.throws(() => normalizeSignageUrl("javascript:alert(1)"), PresentationError);
    assert.throws(() => normalizeSignageUrl("not a url"), PresentationError);
  });
});

describe("reading a hand-edited or newer file", () => {
  test("an unknown layout falls back to the tile grid", () => {
    fs.writeFileSync(file, JSON.stringify({ "tv-a": { layout: "from-the-future", helpTitle: "Kept" } }));
    const p = fresh().get("tv-a");
    assert.equal(p.layout, "hub");
    assert.equal(p.help.title, "Kept");
  });

  test("one malformed entry does not discard the others", () => {
    fs.writeFileSync(file, JSON.stringify({ "tv-a": { layout: 42 }, "tv-b": { layout: "menu" } }));
    const s = fresh();
    assert.equal(s.get("tv-a").layout, "hub");
    assert.equal(s.get("tv-b").layout, "menu");
  });

  test("a stored non-https URL is ignored rather than served", () => {
    fs.writeFileSync(file, JSON.stringify({ "tv-a": { signageUrl: "http://x.example.com/" } }));
    assert.equal(fresh().get("tv-a").signageUrl, null);
  });

  test("a corrupt file yields defaults", () => {
    fs.writeFileSync(file, "{not json");
    assert.equal(fresh().get("tv-a").layout, "hub");
  });
});

describe("help QR image", () => {
  test("stores the image under a content-addressed name served from /icons", () => {
    const p = fresh().setQr("tv-a", PNG_1PX);
    assert.match(p.help.qrUrl ?? "", /^\/icons\/qr-[0-9a-f]{16}\.png$/);
    assert.ok(fs.existsSync(path.join(icons, path.basename(p.help.qrUrl!))));
  });

  test("replacing the image removes the old file", () => {
    const s = fresh();
    const first = path.basename(s.setQr("tv-a", PNG_1PX).help.qrUrl!);
    const second = path.basename(s.setQr("tv-a", PNG_OTHER).help.qrUrl!);
    assert.notEqual(first, second);
    assert.equal(fs.existsSync(path.join(icons, first)), false);
    assert.ok(fs.existsSync(path.join(icons, second)));
  });

  test("an image still used by another display is kept", () => {
    const s = fresh();
    const shared = path.basename(s.setQr("tv-a", PNG_1PX).help.qrUrl!);
    s.setQr("tv-b", PNG_1PX);
    s.clearQr("tv-a");
    assert.ok(fs.existsSync(path.join(icons, shared)));
    assert.equal(s.get("tv-a").help.qrUrl, null);
  });

  test("rejects non-images and oversize files", () => {
    const s = fresh();
    assert.throws(() => s.setQr("tv-a", "data:text/html;base64,PGI+"), PresentationError);
    assert.throws(() => s.setQr("tv-a", "not a data url"), PresentationError);
    const big = "data:image/png;base64," + Buffer.alloc(1024 * 1024 + 1).toString("base64");
    assert.throws(() => s.setQr("tv-a", big), PresentationError);
  });
});

describe("SettingsSaveSchema", () => {
  const base = { enabled: { youtube: true }, order: ["youtube"], autoSignage: true, idleSeconds: 300 };

  test("still accepts the body older clients send", () => {
    assert.equal(SettingsSaveSchema.safeParse(base).success, true);
  });

  test("accepts the presentation fields", () => {
    const r = SettingsSaveSchema.safeParse({ ...base, layout: "grid", helpShow: true, helpTitle: "t", helpMessage: "m", signageUrl: "" });
    assert.equal(r.success, true);
  });

  test("rejects an unknown layout and unknown keys", () => {
    assert.equal(SettingsSaveSchema.safeParse({ ...base, layout: "nope" }).success, false);
    assert.equal(SettingsSaveSchema.safeParse({ ...base, surprise: 1 }).success, false);
  });
});

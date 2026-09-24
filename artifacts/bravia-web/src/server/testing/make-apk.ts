import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

/**
 * Build minimal but structurally real APKs for tests: a ZIP containing an
 * AndroidManifest.xml in Android's binary XML format.
 *
 * Keeps APK binaries out of git -- they'd be large, and OptiSigns' isn't ours
 * to commit -- while still exercising the real parsing path end to end.
 */

export interface ManifestSpec {
  packageName: string;
  versionCode?: number;
  versionName?: string;
  /** Encode the string pool as UTF-8 (aapt2's usual choice) instead of UTF-16. */
  utf8?: boolean;
  /** Blank the attribute names, as obfuscators do, leaving only resource ids. */
  stripAttrNames?: boolean;
}

const TYPE_STRING = 0x03;
const TYPE_INT_DEC = 0x10;
const NO_ENTRY = 0xffffffff;
const ATTR_VERSION_CODE = 0x0101021b;
const ATTR_VERSION_NAME = 0x0101021c;

function u16(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
}
function u32(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0);
  return b;
}
function pad4(b: Buffer): Buffer {
  const r = b.length % 4;
  return r ? Buffer.concat([b, Buffer.alloc(4 - r)]) : b;
}

function stringPool(strings: string[], utf8: boolean): Buffer {
  const encoded = strings.map((s) => {
    if (utf8) {
      const bytes = Buffer.from(s, "utf8");
      return Buffer.concat([Buffer.from([s.length, bytes.length]), bytes, Buffer.from([0])]);
    }
    return Buffer.concat([u16(s.length), Buffer.from(s, "utf16le"), u16(0)]);
  });
  const offsets: number[] = [];
  let at = 0;
  for (const e of encoded) {
    offsets.push(at);
    at += e.length;
  }
  const headerSize = 28;
  const stringsStart = headerSize + strings.length * 4;
  const data = pad4(Buffer.concat(encoded));
  const size = stringsStart + data.length;
  return Buffer.concat([
    u16(0x0001), u16(headerSize), u32(size),
    u32(strings.length), u32(0), u32(utf8 ? 0x100 : 0), u32(stringsStart), u32(0),
    ...offsets.map(u32),
    data,
  ]);
}

/** Binary AndroidManifest.xml with a single <manifest> root element. */
export function buildManifestAxml(spec: ManifestSpec): Buffer {
  const strip = spec.stripAttrNames ?? false;
  // Resource-mapped attribute names come first, so their indices line up with the map.
  const strings: string[] = [strip ? "" : "versionCode", strip ? "" : "versionName", "package", "manifest", spec.packageName];
  const IDX_VCODE = 0, IDX_VNAME = 1, IDX_PACKAGE = 2, IDX_MANIFEST = 3, IDX_PKG_VALUE = 4;
  if (spec.versionName !== undefined) strings.push(spec.versionName);
  const IDX_VNAME_VALUE = strings.length - 1;

  const pool = stringPool(strings, spec.utf8 ?? false);
  const resMap = Buffer.concat([u16(0x0180), u16(8), u32(8 + 8), u32(ATTR_VERSION_CODE), u32(ATTR_VERSION_NAME)]);

  const attr = (name: number, raw: number, type: number, data: number) =>
    Buffer.concat([u32(NO_ENTRY), u32(name), u32(raw), u16(8), Buffer.from([0, type]), u32(data)]);

  const attrs: Buffer[] = [attr(IDX_PACKAGE, IDX_PKG_VALUE, TYPE_STRING, IDX_PKG_VALUE)];
  if (spec.versionCode !== undefined) attrs.push(attr(IDX_VCODE, NO_ENTRY, TYPE_INT_DEC, spec.versionCode));
  if (spec.versionName !== undefined) attrs.push(attr(IDX_VNAME, IDX_VNAME_VALUE, TYPE_STRING, IDX_VNAME_VALUE));

  const ext = Buffer.concat([
    u32(NO_ENTRY), u32(IDX_MANIFEST), u16(20), u16(20), u16(attrs.length), u16(0), u16(0), u16(0),
  ]);
  const body = Buffer.concat([u32(1), u32(NO_ENTRY), ext, ...attrs]);
  const element = Buffer.concat([u16(0x0102), u16(16), u32(8 + body.length), body]);

  const inner = Buffer.concat([pool, resMap, element]);
  return Buffer.concat([u16(0x0003), u16(8), u32(8 + inner.length), inner]);
}

interface ZipEntry {
  name: string;
  data: Buffer;
  deflate?: boolean;
}

/** A plain ZIP (CRCs zeroed -- the APK reader never checks them). */
export function buildZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8");
    const payload = e.deflate ? zlib.deflateRawSync(e.data) : e.data;
    const method = e.deflate ? 8 : 0;
    const local = Buffer.concat([
      u32(0x04034b50), u16(20), u16(0), u16(method), u16(0), u16(0),
      u32(0), u32(payload.length), u32(e.data.length), u16(name.length), u16(0), name, payload,
    ]);
    centrals.push(Buffer.concat([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(method), u16(0), u16(0),
      u32(0), u32(payload.length), u32(e.data.length), u16(name.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(offset), name,
    ]));
    locals.push(local);
    offset += local.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(cd.length), u32(offset), u16(0),
  ]);
  return Buffer.concat([...locals, cd, eocd]);
}

/** Write a fake APK to a temp file and return its path. */
export function makeApkFile(spec: ManifestSpec, opts: { deflate?: boolean; padding?: number } = {}): string {
  const zip = buildZip([
    // Something before the manifest, so the reader has to walk the directory.
    { name: "classes.dex", data: Buffer.alloc(opts.padding ?? 64, 7) },
    { name: "AndroidManifest.xml", data: buildManifestAxml(spec), deflate: opts.deflate ?? true },
  ]);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "apk-")), "test.apk");
  fs.writeFileSync(file, zip);
  return file;
}

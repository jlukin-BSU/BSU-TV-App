import fs from "node:fs";
import zlib from "node:zlib";

/**
 * Read the identity of an APK -- package name, versionCode, versionName --
 * without Android build tools on the server.
 *
 * An APK is a ZIP whose AndroidManifest.xml is not text but Android's binary
 * XML ("AXML"). Only the root <manifest> element is needed, so this reads the
 * ZIP central directory, inflates that one entry, and walks the AXML chunks
 * until it has the root element's attributes. Nothing else in the archive is
 * touched, and nothing is loaded whole: the file is read by offset.
 *
 * Deliberately dependency-free. The alternative is shelling out to aapt2, which
 * the NUC does not have and the service's sandbox would have to be widened for.
 */

export interface ApkInfo {
  packageName: string;
  versionCode: number;
  versionName: string | null;
}

export class ApkError extends Error {}

// ---- ZIP ------------------------------------------------------------------

const EOCD_SIG = 0x06054b50;
const CD_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;
const MANIFEST = "AndroidManifest.xml";

function read(fd: number, position: number, length: number): Buffer {
  const buf = Buffer.alloc(length);
  const got = fs.readSync(fd, buf, 0, length, position);
  if (got !== length) throw new ApkError("Unexpected end of file -- the APK looks truncated.");
  return buf;
}

/** Locate and inflate AndroidManifest.xml from the archive. */
function readManifestEntry(fd: number, fileSize: number): Buffer {
  // The end-of-central-directory record is the last thing in the file, followed
  // only by an optional comment of up to 65535 bytes.
  const tailLen = Math.min(fileSize, 22 + 65535);
  const tail = read(fd, fileSize - tailLen, tailLen);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ApkError("Not a ZIP archive, so not an APK.");

  const entries = tail.readUInt16LE(eocd + 10);
  const cdSize = tail.readUInt32LE(eocd + 12);
  const cdOffset = tail.readUInt32LE(eocd + 16);
  if (cdOffset === 0xffffffff) throw new ApkError("ZIP64 archives are not supported.");

  const cd = read(fd, cdOffset, cdSize);
  let p = 0;
  for (let n = 0; n < entries; n++) {
    if (cd.readUInt32LE(p) !== CD_SIG) throw new ApkError("Corrupt ZIP central directory.");
    const method = cd.readUInt16LE(p + 10);
    const compressedSize = cd.readUInt32LE(p + 20);
    const nameLen = cd.readUInt16LE(p + 28);
    const extraLen = cd.readUInt16LE(p + 30);
    const commentLen = cd.readUInt16LE(p + 32);
    const localOffset = cd.readUInt32LE(p + 42);
    const name = cd.toString("utf8", p + 46, p + 46 + nameLen);

    if (name === MANIFEST) {
      // The local header repeats the name and has its own extra-field length,
      // which can differ from the central directory's -- read it, don't assume.
      const local = read(fd, localOffset, 30);
      if (local.readUInt32LE(0) !== LOCAL_SIG) throw new ApkError("Corrupt ZIP local header.");
      const dataStart = localOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
      const data = read(fd, dataStart, compressedSize);
      if (method === 0) return data;
      if (method === 8) return zlib.inflateRawSync(data);
      throw new ApkError(`Unsupported ZIP compression method ${method}.`);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new ApkError(`No ${MANIFEST} in the archive, so not an APK.`);
}

// ---- Android binary XML ---------------------------------------------------

const RES_XML_TYPE = 0x0003;
const RES_STRING_POOL_TYPE = 0x0001;
const RES_XML_RESOURCE_MAP_TYPE = 0x0180;
const RES_XML_START_ELEMENT_TYPE = 0x0102;
const UTF8_FLAG = 0x100;
const NO_ENTRY = 0xffffffff;

const TYPE_STRING = 0x03;
const TYPE_INT_DEC = 0x10;
const TYPE_INT_HEX = 0x11;

/** android:versionCode / android:versionName, for manifests whose attribute names were stripped. */
const ATTR_VERSION_CODE = 0x0101021b;
const ATTR_VERSION_NAME = 0x0101021c;

function readStringPool(buf: Buffer, start: number): string[] {
  const headerSize = buf.readUInt16LE(start + 2);
  const count = buf.readUInt32LE(start + 8);
  const flags = buf.readUInt32LE(start + 16);
  const stringsStart = buf.readUInt32LE(start + 20);
  const utf8 = (flags & UTF8_FLAG) !== 0;

  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    let p = start + stringsStart + buf.readUInt32LE(start + headerSize + i * 4);
    if (utf8) {
      // Two varint lengths: UTF-16 length (ignored), then byte length.
      if (buf[p]! & 0x80) p += 2;
      else p += 1;
      let byteLen = buf[p]!;
      if (byteLen & 0x80) {
        byteLen = ((byteLen & 0x7f) << 8) | buf[p + 1]!;
        p += 2;
      } else p += 1;
      out.push(buf.toString("utf8", p, p + byteLen));
    } else {
      let len = buf.readUInt16LE(p);
      if (len & 0x8000) {
        len = ((len & 0x7fff) << 16) | buf.readUInt16LE(p + 2);
        p += 4;
      } else p += 2;
      out.push(buf.toString("utf16le", p, p + len * 2));
    }
  }
  return out;
}

function parseManifest(axml: Buffer): ApkInfo {
  if (axml.length < 8 || axml.readUInt16LE(0) !== RES_XML_TYPE) {
    throw new ApkError("AndroidManifest.xml is not Android binary XML.");
  }

  let strings: string[] = [];
  let resMap: number[] = [];
  let p = axml.readUInt16LE(2);

  while (p + 8 <= axml.length) {
    const type = axml.readUInt16LE(p);
    const headerSize = axml.readUInt16LE(p + 2);
    const size = axml.readUInt32LE(p + 4);
    if (size < 8) throw new ApkError("Corrupt binary XML chunk.");

    if (type === RES_STRING_POOL_TYPE) {
      strings = readStringPool(axml, p);
    } else if (type === RES_XML_RESOURCE_MAP_TYPE) {
      resMap = [];
      for (let i = p + 8; i < p + size; i += 4) resMap.push(axml.readUInt32LE(i));
    } else if (type === RES_XML_START_ELEMENT_TYPE) {
      // The first element is <manifest>; everything needed is on it.
      const ext = p + headerSize;
      const attrStart = axml.readUInt16LE(ext + 8);
      const attrSize = axml.readUInt16LE(ext + 10);
      const attrCount = axml.readUInt16LE(ext + 12);

      let packageName: string | null = null;
      let versionCode: number | null = null;
      let versionName: string | null = null;

      for (let i = 0; i < attrCount; i++) {
        const a = ext + attrStart + i * attrSize;
        const nameIdx = axml.readUInt32LE(a + 4);
        const rawValue = axml.readUInt32LE(a + 8);
        const dataType = axml[a + 15]!;
        const data = axml.readUInt32LE(a + 16);

        const name = strings[nameIdx] ?? "";
        const resId = resMap[nameIdx];
        const str = rawValue !== NO_ENTRY ? strings[rawValue] : dataType === TYPE_STRING ? strings[data] : undefined;

        if (name === "package") {
          packageName = str ?? null;
        } else if (name === "versionCode" || resId === ATTR_VERSION_CODE) {
          if (dataType === TYPE_INT_DEC || dataType === TYPE_INT_HEX) versionCode = data;
          else if (str !== undefined && /^\d+$/.test(str)) versionCode = Number(str);
        } else if (name === "versionName" || resId === ATTR_VERSION_NAME) {
          versionName = str ?? null;
        }
      }

      if (!packageName) throw new ApkError("The manifest has no package name.");
      if (versionCode === null) throw new ApkError(`The manifest for ${packageName} has no versionCode.`);
      return { packageName, versionCode, versionName };
    }
    p += size;
  }
  throw new ApkError("The manifest has no root element.");
}

/** Identity of the APK at `filePath`. Throws ApkError for anything that is not a readable APK. */
export function readApkInfo(filePath: string): ApkInfo {
  const fd = fs.openSync(filePath, "r");
  try {
    return parseManifest(readManifestEntry(fd, fs.fstatSync(fd).size));
  } finally {
    fs.closeSync(fd);
  }
}

/** Exposed for tests, which build AXML directly rather than shipping APK binaries. */
export const _internal = { parseManifest };

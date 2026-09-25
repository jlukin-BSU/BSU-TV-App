import QRCode from "qrcode";

/**
 * Make the help card's QR code from a link, so nobody has to find a QR
 * generator and upload an image.
 *
 * Output is an SVG, stored and served exactly like an uploaded QR image. It is
 * served from /icons on the display's own origin, so it must be inert: shapes
 * only, no script, no external references. The library's SVG is just that, and
 * `assertPlainSvg` refuses anything else rather than trusting it blindly.
 */

/** Longest link accepted. Well within QR capacity, and short enough to stay scannable across a room. */
export const QR_LINK_MAX = 500;

export class QrLinkError extends Error {}

/** Accept http(s) and mailto links only; return the normalised form. */
export function normalizeQrLink(raw: string): string {
  const link = raw.trim();
  if (link === "") throw new QrLinkError("Enter a link for the QR code.");
  if (link.length > QR_LINK_MAX) throw new QrLinkError(`The link is longer than ${QR_LINK_MAX} characters.`);
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    throw new QrLinkError("That isn't a valid link. Include https:// at the start.");
  }
  if (!["https:", "http:", "mailto:"].includes(url.protocol)) {
    throw new QrLinkError("The link must start with https://, http:// or mailto:.");
  }
  return link;
}

function assertPlainSvg(svg: string): void {
  const ok =
    /^<svg[\s>][\s\S]*<\/svg>\s*$/.test(svg) &&
    !/<script|<foreignObject|javascript:|\bon[a-z]+\s*=|\bhref\s*=/i.test(svg);
  if (!ok) throw new Error("QR generator produced unexpected SVG; refusing to store it.");
}

/** SVG QR code for `link`: black on white with a quiet-zone margin, medium error correction. */
export async function makeQrSvg(link: string): Promise<string> {
  const svg = await QRCode.toString(normalizeQrLink(link), {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
    color: { dark: "#000000", light: "#ffffff" },
  });
  assertPlainSvg(svg);
  return svg;
}

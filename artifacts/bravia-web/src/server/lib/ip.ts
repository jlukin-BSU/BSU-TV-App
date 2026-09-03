import net from "node:net";

/**
 * Normalise an address for comparison.
 *
 * Node reports IPv4 clients on a dual-stack socket as IPv4-mapped IPv6
 * ("::ffff:10.20.30.41"), and IPv6 text form varies by case and zero-compression.
 * Displays are identified purely by source IP, so a sloppy comparison here means
 * the wrong PSK -- or no match at all.
 */
export function normalizeIp(raw: string): string {
  let value = raw.trim();
  if (value === "") return "";

  // Strip an IPv6 zone index ("fe80::1%eth0").
  const zone = value.indexOf("%");
  if (zone !== -1) value = value.slice(0, zone);

  // Unwrap IPv4-mapped IPv6.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(value);
  if (mapped?.[1]) return mapped[1];

  if (net.isIPv6(value)) {
    // Collapse to a canonical lowercase form so "2001:DB8::1" == "2001:db8:0:0:0:0:0:1".
    return canonicalizeIpv6(value);
  }

  return value;
}

function canonicalizeIpv6(value: string): string {
  const parts = value.toLowerCase().split("::");
  const head = parts[0] ? parts[0].split(":").filter(Boolean) : [];
  const tail = parts.length > 1 && parts[1] ? parts[1].split(":").filter(Boolean) : [];
  const fill = 8 - head.length - tail.length;
  const groups =
    parts.length > 1
      ? [...head, ...Array(Math.max(0, fill)).fill("0"), ...tail]
      : head;
  return groups.map((g) => g.replace(/^0+(?=.)/, "")).join(":");
}

export function isValidIp(value: string): boolean {
  return net.isIP(value) !== 0;
}

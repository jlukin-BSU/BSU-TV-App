import dns from "node:dns/promises";
import { normalizeIp } from "./ip";
import { logger } from "./logger";

/**
 * Resolve a display's hostname to its current IP(s) via the OS resolver (same
 * DNS the displays themselves use). Cached briefly so a burst of requests
 * doesn't hammer DNS; stale results are kept on a lookup failure so a transient
 * DNS hiccup doesn't drop a display.
 *
 * This is what lets a display be registered by hostname and keep working when
 * its DHCP address changes -- provided DNS tracks the change (dynamic DNS or a
 * reservation). Nothing here can find a display whose new IP DNS doesn't know.
 */

const TTL_MS = 60 * 1000;

interface Entry {
  at: number;
  ips: string[];
}

const cache = new Map<string, Entry>();

export async function resolveHost(hostname: string): Promise<string[]> {
  const key = hostname.trim().toLowerCase();
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && now - cached.at < TTL_MS) return cached.ips;

  try {
    const results = await dns.lookup(hostname, { all: true });
    const ips = Array.from(new Set(results.map((r) => normalizeIp(r.address)))).filter(Boolean);
    cache.set(key, { at: now, ips });
    return ips;
  } catch (err) {
    if (cached) {
      logger.warn({ hostname, err: String(err) }, "hostname did not resolve; using cached IPs");
      return cached.ips;
    }
    logger.warn({ hostname, err: String(err) }, "hostname did not resolve");
    return [];
  }
}

/** Force a fresh lookup on the next call (e.g. after a registry change). */
export function clearResolverCache(hostname?: string): void {
  if (hostname) cache.delete(hostname.trim().toLowerCase());
  else cache.clear();
}

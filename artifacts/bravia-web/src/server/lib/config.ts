import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { APPS, COMMANDS, INPUTS } from "../../shared/catalog";
import { isValidIp, normalizeIp } from "./ip";
import { resolveHost } from "./resolver";
import { logger } from "./logger";

const knownAppIds = APPS.map((a) => a.id);
const knownInputIds = INPUTS.map((i) => i.id);
const knownCommandIds = COMMANDS.map((c) => c.id);

export const DisplaySchema = z
  .object({
    /**
     * Identity. Normally derived from `hostname` via DNS, so a display keeps
     * working when its DHCP address changes. Registration is by hostname.
     */
    hostname: z.string().min(1),
    /**
     * Optional fixed-IP override. Set it only when a display should NOT be
     * resolved from DNS (e.g. a loopback test entry, or a device with no DNS
     * record). When set, it is used as the identity and command target directly.
     */
    ip: z.string().min(1).optional(),
    /**
     * Optional command-target override, for bench testing: identity resolves
     * from `hostname` (or `ip`) as usual, but commands go here instead.
     */
    controlIp: z.string().min(1).optional(),
    /** Human-friendly name for the UI header. Defaults to hostname. */
    label: z.string().min(1).optional(),
    /**
     * Pre-Shared Key from the display's own
     * Settings -> Network & Internet -> Local network setup -> IP control.
     */
    psk: z.string().default(""),
    /** Log the Sony call instead of sending it. Overrides the global setting. */
    dryRun: z.boolean().optional(),
    /** Return to signage after idle. Admin can override per display at runtime. */
    autoSignage: z.boolean().optional(),
    /** Optional per-display button overrides; omit to use catalog defaults. */
    inputs: z.array(z.enum(knownInputIds as [string, ...string[]])).optional(),
    apps: z.array(z.enum(knownAppIds as [string, ...string[]])).optional(),
    commands: z.array(z.enum(knownCommandIds as [string, ...string[]])).optional(),
  })
  .strict()
  .superRefine((display, ctx) => {
    if (display.ip !== undefined && !isValidIp(display.ip)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ip"],
        message: `"${display.ip}" is not a valid IP address. Leave it blank to resolve the display from its hostname.`,
      });
    }
    if (display.controlIp !== undefined && !isValidIp(display.controlIp)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["controlIp"],
        message: `"${display.controlIp}" is not a valid IP address.`,
      });
    }
  });

const ConfigSchema = z
  .object({
    /** Global default; individual displays can override. */
    dryRun: z.boolean().default(false),
    displays: z.array(DisplaySchema),
  })
  .strict();

export type DisplayConfigInput = z.infer<typeof DisplaySchema>;

export interface Display {
  hostname: string;
  label: string;
  psk: string;
  dryRun: boolean;
  autoSignage: boolean;
  inputs: string[];
  apps: string[];
  commands: string[];
  /** Explicit identity/target override from config, if any. */
  ipOverride: string | null;
  controlIpOverride: string | null;
  /** Current identity IPs (the override, or resolved from hostname). */
  resolvedIps: string[];
  /** Where commands are sent right now (override, or first resolved IP). */
  targetIp: string | null;
}

/**
 * The live registry. `displays` and `byIp` are the derived view the control
 * side reads; `rawEntries` is the source of truth written back to devices.json.
 * `materialize` rebuilds `displays` from `rawEntries` (sync validation), and
 * `refreshResolution` fills in `resolvedIps`/`targetIp`/`byIp` from DNS -- both
 * mutate in place so holders (e.g. resolveDevice) see changes with no restart.
 */
export interface AppConfig {
  displays: Display[];
  /** Normalised IP -> display, from resolution. */
  byIp: Map<string, Display>;
  rawEntries: DisplayConfigInput[];
  globalDryRun: boolean;
  forcedDryRun: boolean;
  configPath: string;
}

/** Recursively delete keys that start with "//" (JSON documentation comments). */
function stripCommentKeys(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) stripCommentKeys(item);
  } else if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      if (key.startsWith("//")) delete obj[key];
      else stripCommentKeys(obj[key]);
    }
  }
}

function envFlag(name: string): boolean {
  const raw = process.env[name];
  if (!raw) return false;
  const value = raw.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export function resolveConfigPath(): string {
  const fromEnv = process.env["DEVICES_CONFIG"];
  if (fromEnv && fromEnv.trim() !== "") return path.resolve(fromEnv.trim());
  return path.resolve(process.cwd(), "devices.json");
}

function buildDisplay(entry: DisplayConfigInput, globalDryRun: boolean, forcedDryRun: boolean): Display {
  const ipOverride = entry.ip ? normalizeIp(entry.ip) : null;
  const controlIpOverride = entry.controlIp ? normalizeIp(entry.controlIp) : null;
  return {
    hostname: entry.hostname,
    label: entry.label ?? entry.hostname,
    psk: entry.psk,
    dryRun: forcedDryRun || (entry.dryRun ?? globalDryRun),
    autoSignage: entry.autoSignage ?? true,
    inputs: entry.inputs ?? INPUTS.map((i) => i.id),
    apps: entry.apps ?? APPS.filter((a) => a.enabledByDefault).map((a) => a.id),
    commands: entry.commands ?? COMMANDS.filter((c) => c.enabledByDefault).map((c) => c.id),
    ipOverride,
    controlIpOverride,
    // Seed identity/target with the override; DNS resolution fills the rest.
    resolvedIps: ipOverride ? [ipOverride] : [],
    targetIp: controlIpOverride ?? ipOverride ?? null,
  };
}

/**
 * Rebuild `displays` from `rawEntries`, in place (sync). Validates unique
 * hostname and a present PSK (blank PSK is only allowed under dry-run). Does
 * NOT build `byIp` -- that needs DNS and is done by refreshResolution.
 */
export function materialize(config: AppConfig): void {
  const displays = config.rawEntries.map((e) => buildDisplay(e, config.globalDryRun, config.forcedDryRun));

  const missingPsk = displays.filter((d) => !d.dryRun && d.psk.trim() === "");
  if (missingPsk.length > 0) {
    throw new Error(
      `Missing a PSK for: ${missingPsk.map((d) => `"${d.hostname}"`).join(", ")}. Set each one from the display's IP control settings, or mark the entry dry-run.`,
    );
  }

  const seen = new Set<string>();
  for (const d of displays) {
    const key = d.hostname.trim().toLowerCase();
    if (seen.has(key)) {
      throw new Error(`Hostname "${d.hostname}" is listed twice. Each display must have a unique hostname.`);
    }
    seen.add(key);
  }

  config.displays.length = 0;
  config.displays.push(...displays);
}

/**
 * Resolve every display's hostname (unless it has an IP override), update each
 * display's identity IPs and command target, and rebuild `byIp` in place. Safe
 * to call on a timer and after registry changes.
 */
export async function refreshResolution(config: AppConfig): Promise<void> {
  await Promise.all(
    config.displays.map(async (d) => {
      if (d.ipOverride) {
        d.resolvedIps = [d.ipOverride];
      } else {
        d.resolvedIps = await resolveHost(d.hostname);
      }
      d.targetIp = d.controlIpOverride ?? d.ipOverride ?? d.resolvedIps[0] ?? null;
    }),
  );

  const byIp = new Map<string, Display>();
  for (const d of config.displays) {
    for (const ip of d.resolvedIps) {
      const existing = byIp.get(ip);
      if (existing && existing !== d) {
        logger.warn(
          { ip, a: existing.hostname, b: d.hostname },
          "two displays resolve to the same IP; keeping the first",
        );
        continue;
      }
      byIp.set(ip, d);
    }
  }

  config.byIp.clear();
  for (const [k, v] of byIp) config.byIp.set(k, v);
}

export function loadConfig(configPath = resolveConfigPath()): AppConfig {
  let raw: string;
  try {
    raw = fs.readFileSync(configPath, "utf8");
  } catch {
    throw new Error(
      `Could not read device config at ${configPath}. Copy devices.example.json to devices.json and register displays (or set DEVICES_CONFIG to another path).`,
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `${configPath} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Allow "//"-prefixed documentation keys (JSON has no comments) so the
  // annotated example file can be copied verbatim; strip them before the strict
  // schema runs, which still catches genuine typos.
  stripCommentKeys(parsedJson);

  const result = ConfigSchema.safeParse(parsedJson);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`${configPath} is invalid:\n${details}`);
  }

  const config: AppConfig = {
    displays: [],
    byIp: new Map(),
    rawEntries: result.data.displays,
    globalDryRun: result.data.dryRun,
    forcedDryRun: envFlag("BRAVIA_DRY_RUN"),
    configPath,
  };

  try {
    materialize(config);
  } catch (err) {
    throw new Error(`${configPath} is invalid: ${err instanceof Error ? err.message : String(err)}`);
  }

  return config;
}

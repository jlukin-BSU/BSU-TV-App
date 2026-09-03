import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { APPS, COMMANDS, INPUTS } from "../../shared/catalog";
import { isValidIp, normalizeIp } from "./ip";

const knownAppIds = APPS.map((a) => a.id);
const knownInputIds = INPUTS.map((i) => i.id);
const knownCommandIds = COMMANDS.map((c) => c.id);

const DisplaySchema = z
  .object({
    /** Reserved/static address of the display on the AV VLAN. */
    ip: z.string().min(1),
    /**
     * Where commands are actually sent. Defaults to `ip`, which is what you
     * want in production: the display that asks is the display that acts.
     *
     * Set it only for bench testing -- put your workstation's address in `ip`
     * and the display's in `controlIp`, and clicking from your desk drives the
     * real panel.
     */
    controlIp: z.string().min(1).optional(),
    hostname: z.string().min(1),
    /** Human-friendly name for the UI header. Defaults to hostname. */
    label: z.string().min(1).optional(),
    /**
     * Pre-Shared Key from the display's own
     * Settings -> Network & Internet -> Local network setup -> IP control.
     */
    psk: z.string().default(""),
    /** Log the Sony call instead of sending it. Overrides the global setting. */
    dryRun: z.boolean().optional(),
    /** Optional per-display button overrides; omit to use catalog defaults. */
    inputs: z.array(z.enum(knownInputIds as [string, ...string[]])).optional(),
    apps: z.array(z.enum(knownAppIds as [string, ...string[]])).optional(),
    commands: z.array(z.enum(knownCommandIds as [string, ...string[]])).optional(),
  })
  .strict()
  .superRefine((display, ctx) => {
    if (!isValidIp(display.ip)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ip"],
        message: `"${display.ip}" is not a valid IP address. Displays are identified by source IP, so this must be the display's reserved address.`,
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
    displays: z.array(DisplaySchema).min(1),
  })
  .strict();

export type DisplayConfigInput = z.infer<typeof DisplaySchema>;

export interface Display {
  /** Identity: the address the display sends requests from. */
  ip: string;
  /** Target: where commands are sent. Equals `ip` unless overridden. */
  controlIp: string;
  hostname: string;
  label: string;
  psk: string;
  dryRun: boolean;
  inputs: string[];
  apps: string[];
  commands: string[];
}

export interface AppConfig {
  displays: Display[];
  /** Normalised IP -> display. */
  byIp: Map<string, Display>;
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

export function loadConfig(configPath = resolveConfigPath()): AppConfig {
  let raw: string;
  try {
    raw = fs.readFileSync(configPath, "utf8");
  } catch {
    throw new Error(
      `Could not read device config at ${configPath}. Copy devices.example.json to devices.json and fill in each display's IP, hostname and PSK (or set DEVICES_CONFIG to another path).`,
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

  const result = ConfigSchema.safeParse(parsedJson);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`${configPath} is invalid:\n${details}`);
  }

  /**
   * BRAVIA_DRY_RUN forces every display into dry-run, overriding both the
   * file-level default and any per-display setting. It is the escape hatch for
   * "test the whole path with no hardware attached".
   */
  const forcedDryRun = envFlag("BRAVIA_DRY_RUN");
  const globalDryRun = result.data.dryRun;

  const displays: Display[] = result.data.displays.map((entry) => ({
    ip: normalizeIp(entry.ip),
    controlIp: normalizeIp(entry.controlIp ?? entry.ip),
    hostname: entry.hostname,
    label: entry.label ?? entry.hostname,
    psk: entry.psk,
    dryRun: forcedDryRun || (entry.dryRun ?? globalDryRun),
    inputs: entry.inputs ?? INPUTS.map((i) => i.id),
    apps: entry.apps ?? APPS.filter((a) => a.enabledByDefault).map((a) => a.id),
    commands: entry.commands ?? COMMANDS.filter((c) => c.enabledByDefault).map((c) => c.id),
  }));

  /**
   * A blank PSK is only meaningful when nothing will actually be sent. Checked
   * here rather than in the schema because the effective dryRun value depends
   * on BRAVIA_DRY_RUN, which the schema cannot see.
   */
  const missingPsk = displays.filter((d) => !d.dryRun && d.psk.trim() === "");
  if (missingPsk.length > 0) {
    throw new Error(
      `${configPath} is missing a psk for: ${missingPsk
        .map((d) => `"${d.hostname}"`)
        .join(", ")}. Set each one from the display's Settings -> Network & Internet -> Local network setup -> IP control, or mark the entry "dryRun": true.`,
    );
  }

  const byIp = new Map<string, Display>();
  for (const display of displays) {
    const existing = byIp.get(display.ip);
    if (existing) {
      throw new Error(
        `${configPath} lists ${display.ip} twice ("${existing.hostname}" and "${display.hostname}"). Source IP is the identity, so it must be unique.`,
      );
    }
    byIp.set(display.ip, display);
  }

  return { displays, byIp };
}

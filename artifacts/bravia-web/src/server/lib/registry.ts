import fs from "node:fs";
import { z } from "zod";
import {
  DisplaySchema,
  materialize,
  type AppConfig,
  type DisplayConfigInput,
} from "./config";
import { normalizeIp } from "./ip";
import { logger } from "./logger";

/**
 * Add / edit / remove displays in the live registry, and persist devices.json.
 *
 * All mutations are transactional against the in-memory registry: a change is
 * validated by re-materialising a trial copy of the entries first, and only if
 * that succeeds is it applied in place and written to disk. So a bad edit (dup
 * IP, missing PSK) is rejected without leaving the running service in a broken
 * state or corrupting the file.
 */

export class RegistryError extends Error {}

/** One entry as accepted from the management API (before schema defaults). */
export const DeviceInput = DisplaySchema;
export type DeviceInputT = z.input<typeof DeviceInput>;

function persist(config: AppConfig): void {
  const payload = JSON.stringify(
    { dryRun: config.globalDryRun, displays: config.rawEntries },
    null,
    2,
  );
  const tmp = `${config.configPath}.tmp`;
  fs.writeFileSync(tmp, payload, "utf8");
  fs.renameSync(tmp, config.configPath);
}

/**
 * Try a new set of entries: materialise a shallow clone to validate, and only
 * on success swap it into the live config, persist, and return. Throws
 * RegistryError with a readable message otherwise, leaving the live config
 * untouched.
 */
function applyEntries(config: AppConfig, next: DisplayConfigInput[]): void {
  const trial: AppConfig = { ...config, rawEntries: next, displays: [], byIp: new Map() };
  try {
    materialize(trial);
  } catch (err) {
    throw new RegistryError(err instanceof Error ? err.message : String(err));
  }

  config.rawEntries = next;
  materialize(config); // rebuild the live displays/byIp in place
  try {
    persist(config);
  } catch (err) {
    // Persist failed after an in-memory change; surface it but the live state
    // already reflects the edit. The next successful write reconciles the file.
    logger.error({ err: String(err), path: config.configPath }, "failed to write devices.json");
    throw new RegistryError(`Saved in memory but could not write ${config.configPath}: ${err}`);
  }
}

function findIndexByIp(config: AppConfig, ip: string): number {
  const norm = normalizeIp(ip);
  return config.rawEntries.findIndex((e) => normalizeIp(e.ip) === norm);
}

/** Raw entries, for the management list view. */
export function listEntries(config: AppConfig): DisplayConfigInput[] {
  return config.rawEntries;
}

export function addDevice(config: AppConfig, input: unknown): DisplayConfigInput {
  const parsed = DeviceInput.safeParse(input);
  if (!parsed.success) throw new RegistryError(firstIssue(parsed.error));
  if (findIndexByIp(config, parsed.data.ip) !== -1) {
    throw new RegistryError(`A display with IP ${parsed.data.ip} already exists.`);
  }
  applyEntries(config, [...config.rawEntries, parsed.data]);
  logger.info({ ip: parsed.data.ip, hostname: parsed.data.hostname }, "device added");
  return parsed.data;
}

export function updateDevice(config: AppConfig, originalIp: string, input: unknown): DisplayConfigInput {
  const idx = findIndexByIp(config, originalIp);
  if (idx === -1) throw new RegistryError(`No display registered at ${originalIp}.`);
  const parsed = DeviceInput.safeParse(input);
  if (!parsed.success) throw new RegistryError(firstIssue(parsed.error));

  // If the IP changed, the new IP must not collide with a different entry.
  const collision = findIndexByIp(config, parsed.data.ip);
  if (collision !== -1 && collision !== idx) {
    throw new RegistryError(`A different display already uses IP ${parsed.data.ip}.`);
  }

  const next = [...config.rawEntries];
  next[idx] = parsed.data;
  applyEntries(config, next);
  logger.info({ ip: parsed.data.ip, hostname: parsed.data.hostname }, "device updated");
  return parsed.data;
}

export function removeDevice(config: AppConfig, ip: string): void {
  const idx = findIndexByIp(config, ip);
  if (idx === -1) throw new RegistryError(`No display registered at ${ip}.`);
  const next = config.rawEntries.filter((_, i) => i !== idx);
  applyEntries(config, next);
  logger.info({ ip }, "device removed");
}

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Invalid input.";
  const where = issue.path.join(".");
  return where ? `${where}: ${issue.message}` : issue.message;
}

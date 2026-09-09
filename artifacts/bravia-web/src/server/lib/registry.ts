import fs from "node:fs";
import { z } from "zod";
import {
  DisplaySchema,
  materialize,
  refreshResolution,
  type AppConfig,
  type DisplayConfigInput,
} from "./config";
import { clearResolverCache } from "./resolver";
import { logger } from "./logger";

/**
 * Add / edit / remove displays in the live registry, and persist devices.json.
 * Displays are addressed by hostname (the identity); the IP is resolved from it.
 *
 * All mutations are transactional against the in-memory registry: a change is
 * validated by re-materialising a trial copy of the entries first, and only if
 * that succeeds is it applied in place, written to disk, and re-resolved. So a
 * bad edit (dup hostname, missing PSK) is rejected without leaving the running
 * service broken or corrupting the file.
 */

export class RegistryError extends Error {}

export const DeviceInput = DisplaySchema;

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
 * Validate a candidate set of entries against a trial materialise, then apply
 * it live, persist, and re-resolve DNS. Throws RegistryError (leaving the live
 * config untouched) on a validation failure.
 */
async function applyEntries(config: AppConfig, next: DisplayConfigInput[]): Promise<void> {
  const trial: AppConfig = { ...config, rawEntries: next, displays: [], byIp: new Map() };
  try {
    materialize(trial);
  } catch (err) {
    throw new RegistryError(err instanceof Error ? err.message : String(err));
  }

  config.rawEntries = next;
  materialize(config);
  try {
    persist(config);
  } catch (err) {
    logger.error({ err: String(err), path: config.configPath }, "failed to write devices.json");
    throw new RegistryError(`Saved in memory but could not write ${config.configPath}: ${err}`);
  }

  await refreshResolution(config);
}

function normHost(h: string): string {
  return h.trim().toLowerCase();
}

function findIndexByHostname(config: AppConfig, hostname: string): number {
  const key = normHost(hostname);
  return config.rawEntries.findIndex((e) => normHost(e.hostname) === key);
}

/** Raw entries, for the management list view. */
export function listEntries(config: AppConfig): DisplayConfigInput[] {
  return config.rawEntries;
}

export async function addDevice(config: AppConfig, input: unknown): Promise<DisplayConfigInput> {
  const parsed = DeviceInput.safeParse(input);
  if (!parsed.success) throw new RegistryError(firstIssue(parsed.error));
  if (findIndexByHostname(config, parsed.data.hostname) !== -1) {
    throw new RegistryError(`A display with hostname "${parsed.data.hostname}" already exists.`);
  }
  clearResolverCache(parsed.data.hostname);
  await applyEntries(config, [...config.rawEntries, parsed.data]);
  logger.info({ hostname: parsed.data.hostname }, "device added");
  return parsed.data;
}

export async function updateDevice(config: AppConfig, originalHostname: string, input: unknown): Promise<DisplayConfigInput> {
  const idx = findIndexByHostname(config, originalHostname);
  if (idx === -1) throw new RegistryError(`No display registered with hostname "${originalHostname}".`);
  const parsed = DeviceInput.safeParse(input);
  if (!parsed.success) throw new RegistryError(firstIssue(parsed.error));

  // If the hostname changed, it must not collide with a different entry.
  const collision = findIndexByHostname(config, parsed.data.hostname);
  if (collision !== -1 && collision !== idx) {
    throw new RegistryError(`A different display already uses hostname "${parsed.data.hostname}".`);
  }

  const next = [...config.rawEntries];
  next[idx] = parsed.data;
  clearResolverCache(originalHostname);
  clearResolverCache(parsed.data.hostname);
  await applyEntries(config, next);
  logger.info({ hostname: parsed.data.hostname }, "device updated");
  return parsed.data;
}

export async function removeDevice(config: AppConfig, hostname: string): Promise<void> {
  const idx = findIndexByHostname(config, hostname);
  if (idx === -1) throw new RegistryError(`No display registered with hostname "${hostname}".`);
  const next = config.rawEntries.filter((_, i) => i !== idx);
  clearResolverCache(hostname);
  await applyEntries(config, next);
  logger.info({ hostname }, "device removed");
}

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Invalid input.";
  const where = issue.path.join(".");
  return where ? `${where}: ${issue.message}` : issue.message;
}

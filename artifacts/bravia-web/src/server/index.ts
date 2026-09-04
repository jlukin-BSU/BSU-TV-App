import { createApp } from "./app";
import { loadConfig, resolveConfigPath } from "./lib/config";
import { SettingsStore, resolveOverridesPath } from "./lib/settings";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"] ?? "8080";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

/** Bind to loopback by default -- nginx is the only thing that should reach us. */
const host = process.env["HOST"] ?? "127.0.0.1";

const configPath = resolveConfigPath();

let config;
try {
  config = loadConfig(configPath);
} catch (err) {
  logger.error(
    { err: err instanceof Error ? err.message : String(err) },
    "Failed to load device config",
  );
  process.exit(1);
}

logger.info(
  {
    configPath,
    displays: config.displays.map((d) => ({
      hostname: d.hostname,
      ip: d.ip,
      // Only worth showing when it differs -- i.e. a bench-test entry.
      ...(d.controlIp === d.ip ? {} : { controlIp: d.controlIp }),
      dryRun: d.dryRun,
    })),
  },
  "Device config loaded",
);

const overridesPath = resolveOverridesPath();
const store = new SettingsStore(overridesPath);
logger.info({ overridesPath }, "Settings store ready");

const app = createApp(config, store);

const server = app.listen(port, host, () => {
  logger.info({ port, host }, "bravia-web listening");
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    logger.info({ signal }, "Shutting down");
    server.close(() => process.exit(0));
  });
}

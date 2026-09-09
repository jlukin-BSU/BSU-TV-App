import { createApp } from "./app";
import { createManageApp } from "./manage-app";
import { loadConfig, refreshResolution, resolveConfigPath } from "./lib/config";
import { SettingsStore, resolveOverridesPath } from "./lib/settings";
import { AppOverridesStore, resolveAppOverridesPath } from "./lib/app-overrides";
import { CustomAppsStore, resolveCustomAppsPath, resolveIconsDir } from "./lib/custom-apps";
import { mgmtEnabled, mgmtPort } from "./lib/mgmt";
import { logger } from "./lib/logger";

/** How often to re-resolve display hostnames to catch DHCP address changes. */
const RESOLUTION_INTERVAL_MS = 60 * 1000;

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
      ...(d.ipOverride ? { ipOverride: d.ipOverride } : {}),
      dryRun: d.dryRun,
    })),
  },
  "Device config loaded",
);

// Resolve every display's hostname before serving, then keep it fresh so a
// display that changes DHCP address is picked up automatically.
await refreshResolution(config);
logger.info(
  { displays: config.displays.map((d) => ({ hostname: d.hostname, ips: d.resolvedIps, target: d.targetIp })) },
  "Initial hostname resolution complete",
);
setInterval(() => {
  refreshResolution(config).catch((err) =>
    logger.warn({ err: String(err) }, "hostname resolution refresh failed"),
  );
}, RESOLUTION_INTERVAL_MS).unref();

const overridesPath = resolveOverridesPath();
const store = new SettingsStore(overridesPath);
const appOverridesPath = resolveAppOverridesPath();
const appOverrides = new AppOverridesStore(appOverridesPath);
const customApps = new CustomAppsStore(resolveCustomAppsPath(), resolveIconsDir());
logger.info(
  { overridesPath, appOverridesPath, customApps: customApps.list().length, iconsDir: resolveIconsDir() },
  "Stores ready",
);

const app = createApp(config, store, appOverrides);

const server = app.listen(port, host, () => {
  logger.info({ port, host }, "bravia-web listening");
});

/**
 * The management server (device registration) shares the same live registry, so
 * edits take effect on the control plane immediately. It binds all interfaces
 * so it is reachable from a phone, on its own port, and only starts when
 * MGMT_PASSWORD is set -- the registry is never editable without a credential.
 */
let manageServer: ReturnType<typeof app.listen> | null = null;
if (mgmtEnabled()) {
  const mport = mgmtPort();
  const manageApp = createManageApp(config, store, appOverrides, customApps);
  manageServer = manageApp.listen(mport, "0.0.0.0", () => {
    logger.info({ port: mport }, "management server listening (device registration)");
  });
} else {
  logger.info("management server disabled (set MGMT_PASSWORD to enable device registration)");
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    logger.info({ signal }, "Shutting down");
    server.close(() => {
      if (manageServer) manageServer.close(() => process.exit(0));
      else process.exit(0);
    });
  });
}

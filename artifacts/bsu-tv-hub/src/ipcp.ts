/** Centralized IPCP action constants. Add new actions here; no refactor needed. */
export const IpcpAction = {
  HDMI1:   "HDMI1",
  HDMI2:   "HDMI2",
  PWROFF:  "PWROFF",
  PWRON:   "PWRON",
  CAST:    "CAST",
  AIRPLAY: "AIRPLAY",
} as const;

export type IpcpAction = (typeof IpcpAction)[keyof typeof IpcpAction];

export interface IpcpSettings {
  ipcpHost:       string;
  ipcpPort:       number;
  ipcpUsername:   string;
  ipcpPassword:   string;
  ipcpUseHttps:   boolean;
  ipcpTvId:       string;
}

/**
 * Send a JSON command to the IPCP endpoint.
 *
 * POST body:
 *   { "tv": "<tvIdentifier>", "action": "<ACTION>", "timestamp": <epoch_seconds> }
 *
 * Auth: HTTP Basic (username + password from settings).
 * All connection params come from settings — nothing is hardcoded.
 */
export async function sendIpcpCommand(
  action: IpcpAction,
  cfg: IpcpSettings,
): Promise<void> {
  const { ipcpHost, ipcpPort, ipcpUsername, ipcpPassword, ipcpUseHttps, ipcpTvId } = cfg;

  if (!ipcpHost) throw new Error("IPCP host is not configured");

  const protocol = ipcpUseHttps ? "https" : "http";
  const url = `${protocol}://${ipcpHost}:${ipcpPort}`;

  const body = JSON.stringify({
    tv:        ipcpTvId || window.location.hostname,
    action,
    timestamp: Math.floor(Date.now() / 1000),
  });

  const credentials = btoa(`${ipcpUsername}:${ipcpPassword}`);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Basic ${credentials}`,
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`IPCP ${action} failed: HTTP ${res.status}`);
  }
}

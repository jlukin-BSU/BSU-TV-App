import { useState, useCallback, useEffect } from "react";
import { registerPlugin } from "@capacitor/core";

interface DeviceHostnamePlugin { getHostname(): Promise<{ hostname: string }>; }
const DeviceHostname = registerPlugin<DeviceHostnamePlugin>("DeviceHostname");

const SETTINGS_KEY = "bsu_hub_settings";
const IPCP_KEY     = "bsu_ipcp_settings";

export const ALL_TILE_IDS = [
  "signage", "livetv", "hdmi", "youtube", "screenoff",
  "cast", "airplay",
  "hulu", "netflix", "tubi",
] as const;

export interface HubSettings {
  autoSignageEnabled: boolean;
  tileVisibility: Record<string, boolean>;
  tileOrder: string[];
}

export interface IpcpSettings {
  ipcpHost:     string;
  ipcpPort:     number;
  ipcpUsername: string;
  ipcpPassword: string;
  ipcpUseHttps: boolean;
  ipcpTvId:     string;
}

export const DEFAULT_IPCP: IpcpSettings = {
  ipcpHost:     "",
  ipcpPort:     80,
  ipcpUsername: "admin",
  ipcpPassword: "",
  ipcpUseHttps: false,
  ipcpTvId:     "",
};

export const DEFAULT_TILE_VISIBILITY: Record<string, boolean> = {
  signage:   true,
  livetv:    true,
  hdmi:      true,
  youtube:   true,
  screenoff: true,
  cast:      true,
  airplay:   true,
  hulu:      false,
  netflix:   false,
  tubi:      false,
};

function loadSettings(): HubSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<HubSettings>;
      const savedOrder: string[] = Array.isArray(parsed.tileOrder) ? parsed.tileOrder : [];
      const mergedOrder = [
        ...savedOrder.filter(id => (ALL_TILE_IDS as readonly string[]).includes(id)),
        ...(ALL_TILE_IDS as readonly string[]).filter(id => !savedOrder.includes(id)),
      ];
      return {
        autoSignageEnabled: parsed.autoSignageEnabled ?? true,
        tileVisibility: { ...DEFAULT_TILE_VISIBILITY, ...(parsed.tileVisibility ?? {}) },
        tileOrder: mergedOrder,
      };
    }
  } catch {}
  return {
    autoSignageEnabled: true,
    tileVisibility: { ...DEFAULT_TILE_VISIBILITY },
    tileOrder: [...ALL_TILE_IDS],
  };
}

function loadIpcp(): IpcpSettings {
  try {
    const raw = localStorage.getItem(IPCP_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<IpcpSettings>;
      return { ...DEFAULT_IPCP, ...parsed };
    }
  } catch {}
  return { ...DEFAULT_IPCP };
}

export function useHubSettings() {
  const [settings, setSettings] = useState<HubSettings>(loadSettings);

  const updateSettings = useCallback((updated: HubSettings) => {
    setSettings(updated);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
    } catch {}
  }, []);

  return [settings, updateSettings] as const;
}

export function useIpcpSettings() {
  const [ipcp, setIpcp] = useState<IpcpSettings>(loadIpcp);

  const updateIpcp = useCallback((updated: IpcpSettings) => {
    setIpcp(updated);
    try {
      localStorage.setItem(IPCP_KEY, JSON.stringify(updated));
    } catch {}
  }, []);

  // On first load (tvId not yet saved), auto-populate with the device hostname
  // obtained from the native DeviceHostname plugin (Android TV device name /
  // network hostname). Falls back to UA model string in browsers.
  useEffect(() => {
    const saved = (() => {
      try { return JSON.parse(localStorage.getItem(IPCP_KEY) ?? "{}"); } catch { return {}; }
    })();
    if (saved.ipcpTvId) return; // user already set a value — don't overwrite

    const applyHostname = (name: string) => {
      if (!name) return;
      setIpcp(prev => ({ ...prev, ipcpTvId: name }));
      try {
        const current = JSON.parse(localStorage.getItem(IPCP_KEY) ?? "{}");
        localStorage.setItem(IPCP_KEY, JSON.stringify({ ...current, ipcpTvId: name }));
      } catch {}
    };

    // Try native plugin first (works inside the APK on Android TV).
    DeviceHostname.getHostname()
      .then(r => applyHostname(r.hostname))
      .catch(() => {
        // Browser / dev fallback: parse model from WebView UA string.
        const match = navigator.userAgent.match(/\(Linux;\s*Android\s*[\d.]+;\s*([^)]+?)\s*Build\//);
        const model = match?.[1]?.trim();
        if (model) applyHostname(model);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return [ipcp, updateIpcp] as const;
}

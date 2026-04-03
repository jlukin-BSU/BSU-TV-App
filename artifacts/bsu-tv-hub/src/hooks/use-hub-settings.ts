import { useState, useCallback } from "react";

const SETTINGS_KEY = "bsu_hub_settings";
const RELAY_KEY    = "bsu_relay_settings";

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

export interface RelaySettings {
  tvHostname: string;
}

export const DEFAULT_RELAY: RelaySettings = {
  tvHostname: "",
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

function loadRelay(): RelaySettings {
  try {
    const raw = localStorage.getItem(RELAY_KEY);
    if (raw) return { ...DEFAULT_RELAY, ...(JSON.parse(raw) as Partial<RelaySettings>) };
  } catch {}
  return { ...DEFAULT_RELAY };
}

export function useHubSettings() {
  const [settings, setSettings] = useState<HubSettings>(loadSettings);

  const updateSettings = useCallback((updated: HubSettings) => {
    setSettings(updated);
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated)); } catch {}
  }, []);

  return [settings, updateSettings] as const;
}

export function useRelaySettings() {
  const [relay, setRelay] = useState<RelaySettings>(loadRelay);

  const updateRelay = useCallback((updated: RelaySettings) => {
    setRelay(updated);
    try { localStorage.setItem(RELAY_KEY, JSON.stringify(updated)); } catch {}
  }, []);

  return [relay, updateRelay] as const;
}

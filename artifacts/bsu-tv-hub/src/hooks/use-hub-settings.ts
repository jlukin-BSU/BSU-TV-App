import { useState, useCallback } from "react";

const SETTINGS_KEY = "bsu_hub_settings";

export interface HubSettings {
  autoSignageEnabled: boolean;
  tileVisibility: Record<string, boolean>;
}

export const DEFAULT_TILE_VISIBILITY: Record<string, boolean> = {
  signage:   true,
  livetv:    true,
  hdmi:      true,
  youtube:   true,
  screenoff: true,
  hulu:      false,
  netflix:   false,
  tubi:      false,
};

function loadSettings(): HubSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<HubSettings>;
      return {
        autoSignageEnabled: parsed.autoSignageEnabled ?? true,
        tileVisibility: { ...DEFAULT_TILE_VISIBILITY, ...(parsed.tileVisibility ?? {}) },
      };
    }
  } catch {}
  return { autoSignageEnabled: true, tileVisibility: { ...DEFAULT_TILE_VISIBILITY } };
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

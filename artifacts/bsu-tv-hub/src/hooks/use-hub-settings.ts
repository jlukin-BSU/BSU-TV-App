import { useState, useCallback } from "react";

const SETTINGS_KEY = "bsu_hub_settings";

export const ALL_TILE_IDS = [
  "signage", "livetv", "hdmi", "youtube", "screenoff",
  "hulu", "netflix", "tubi",
] as const;

export interface HubSettings {
  autoSignageEnabled: boolean;
  tileVisibility: Record<string, boolean>;
  tileOrder: string[];
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
      const savedOrder: string[] = Array.isArray(parsed.tileOrder) ? parsed.tileOrder : [];
      // Merge: keep saved order, append any new tile IDs not yet in it
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

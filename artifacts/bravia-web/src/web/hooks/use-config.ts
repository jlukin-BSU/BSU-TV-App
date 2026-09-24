import { useCallback, useEffect, useState } from "react";
import { getConfig } from "../lib/api";
import type { ClientConfig } from "../../shared/catalog";

export type ConfigState =
  | { status: "loading" }
  | { status: "ready"; config: ClientConfig }
  | { status: "error"; message: string };

/**
 * Loads this display's config. The server derives identity from the request's
 * source IP, so an unregistered display comes back as an error naming its own
 * address. `reload` re-fetches after an admin change.
 */
export function useConfig(): { state: ConfigState; reload: () => void } {
  const [state, setState] = useState<ConfigState>({ status: "loading" });

  const reload = useCallback(() => {
    let cancelled = false;
    getConfig()
      .then((config) => {
        if (!cancelled) setState({ status: "ready", config });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => reload(), [reload]);

  return { state, reload };
}

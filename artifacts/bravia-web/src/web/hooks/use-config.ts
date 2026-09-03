import { useEffect, useState } from "react";
import { getConfig } from "../lib/api";
import type { ClientConfig } from "../../shared/catalog";

type State =
  | { status: "loading" }
  | { status: "ready"; config: ClientConfig }
  | { status: "error"; message: string };

/**
 * Loads this display's config once. The server derives identity from the
 * request's source IP, so an unregistered display comes back as an error here
 * with a message naming its own address.
 */
export function useConfig(): State {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    getConfig()
      .then((config) => {
        if (!cancelled) setState({ status: "ready", config });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            message: err instanceof Error ? err.message : String(err),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

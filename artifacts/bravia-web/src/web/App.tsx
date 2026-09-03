import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClientConfig } from "../shared/catalog";

/**
 * Control panel for a single Sony BRAVIA Professional Display.
 *
 * The page never says which display it is -- the server works that out from the
 * request's source IP. So there is nothing to configure here and nothing
 * display-specific in localStorage: the same URL, loaded on any registered
 * display, controls that display and only that display.
 */

type Kind = "input" | "app" | "command";

interface Button {
  kind: Kind;
  id: string;
  label: string;
}

interface Status {
  tone: "pending" | "ok" | "error";
  message: string;
}

const ENDPOINT: Record<Kind, string> = {
  input: "/api/input",
  app: "/api/app",
  command: "/api/command",
};

const BODY_KEY: Record<Kind, string> = {
  input: "inputId",
  app: "appId",
  command: "commandId",
};

export function App() {
  const [config, setConfig] = useState<ClientConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const [busy, setBusy] = useState(false);

  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/config", { headers: { Accept: "application/json" } })
      .then(async (res) => {
        const text = await res.text();
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new Error(`Server returned an unexpected response (HTTP ${res.status}).`);
        }
        if (!res.ok) {
          const message =
            typeof parsed === "object" && parsed !== null && "message" in parsed
              ? String((parsed as { message: unknown }).message)
              : `HTTP ${res.status}`;
          throw new Error(message);
        }
        return parsed as ClientConfig;
      })
      .then((data) => {
        if (!cancelled) setConfig(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const buttons = useMemo<Button[]>(() => {
    if (!config) return [];
    return [
      ...config.inputs.map((i) => ({ kind: "input" as const, id: i.id, label: i.label })),
      ...config.apps.map((a) => ({ kind: "app" as const, id: a.id, label: a.label })),
      ...config.commands.map((c) => ({ kind: "command" as const, id: c.id, label: c.label })),
    ];
  }, [config]);

  const send = useCallback(
    async (button: Button) => {
      if (busy) return;
      setBusy(true);
      setStatus({ tone: "pending", message: `${button.label}...` });

      try {
        const res = await fetch(ENDPOINT[button.kind], {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [BODY_KEY[button.kind]]: button.id }),
        });

        const text = await res.text();
        let parsed: Record<string, unknown> = {};
        try {
          parsed = JSON.parse(text) as Record<string, unknown>;
        } catch {
          /* fall through to a generic message below */
        }

        if (!res.ok) {
          const message =
            typeof parsed.message === "string"
              ? parsed.message
              : `Command failed (HTTP ${res.status}).`;
          setStatus({ tone: "error", message });
          return;
        }

        setStatus({ tone: "ok", message: `${button.label} sent` });
      } catch (err) {
        setStatus({
          tone: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  /** Clear a settled status after a few seconds; leave errors up a bit longer. */
  useEffect(() => {
    if (!status || status.tone === "pending") return;
    const ms = status.tone === "error" ? 8000 : 2500;
    const timer = window.setTimeout(() => setStatus(null), ms);
    return () => window.clearTimeout(timer);
  }, [status]);

  const columns = 3;

  /** Remote D-pad arrives as arrow keys in the display's browser. */
  useEffect(() => {
    if (buttons.length === 0) return;

    const onKey = (e: KeyboardEvent) => {
      let next = focusIndex;
      if (e.key === "ArrowRight") next = Math.min(buttons.length - 1, focusIndex + 1);
      else if (e.key === "ArrowLeft") next = Math.max(0, focusIndex - 1);
      else if (e.key === "ArrowDown") next = Math.min(buttons.length - 1, focusIndex + columns);
      else if (e.key === "ArrowUp") next = Math.max(0, focusIndex - columns);
      else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const target = buttons[focusIndex];
        if (target) void send(target);
        return;
      } else {
        return;
      }

      e.preventDefault();
      setFocusIndex(next);
      buttonRefs.current[next]?.focus();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [buttons, focusIndex, send, columns]);

  if (loadError) {
    return (
      <main className="shell">
        <div className="panel panel--error">
          <h1>Not registered</h1>
          <p>{loadError}</p>
        </div>
      </main>
    );
  }

  if (!config) {
    return (
      <main className="shell">
        <div className="panel">
          <p className="muted">Loading...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="header">
        <div>
          <h1>{config.device.label}</h1>
          <p className="muted">
            {config.device.hostname} &middot; {config.device.ip}
          </p>
        </div>
        {config.device.dryRun && <span className="badge">DRY RUN</span>}
      </header>

      {renderGroup("TV Inputs", buttons, "input", focusIndex, buttonRefs, setFocusIndex, send, busy)}
      {renderGroup("Apps", buttons, "app", focusIndex, buttonRefs, setFocusIndex, send, busy)}
      {renderGroup("Display", buttons, "command", focusIndex, buttonRefs, setFocusIndex, send, busy)}

      {status && (
        <div className={`toast toast--${status.tone}`} role="status" aria-live="polite">
          {status.message}
        </div>
      )}
    </main>
  );
}

function renderGroup(
  title: string,
  buttons: Button[],
  kind: Kind,
  focusIndex: number,
  refs: React.RefObject<(HTMLButtonElement | null)[]>,
  setFocusIndex: (i: number) => void,
  send: (b: Button) => void | Promise<void>,
  busy: boolean,
) {
  const items = buttons
    .map((button, index) => ({ button, index }))
    .filter((entry) => entry.button.kind === kind);

  if (items.length === 0) return null;

  return (
    <section className="group" key={kind}>
      <h2 className="group__title">{title}</h2>
      <div className="grid">
        {items.map(({ button, index }) => (
          <button
            key={`${button.kind}:${button.id}`}
            ref={(el) => {
              refs.current[index] = el;
            }}
            className={`tile${focusIndex === index ? " tile--focused" : ""}`}
            disabled={busy}
            onFocus={() => setFocusIndex(index)}
            onMouseEnter={() => setFocusIndex(index)}
            onClick={() => void send(button)}
          >
            {button.label}
          </button>
        ))}
      </div>
    </section>
  );
}

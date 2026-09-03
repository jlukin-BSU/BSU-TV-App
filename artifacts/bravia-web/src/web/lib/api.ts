import type { ClientConfig } from "../../shared/catalog";

/**
 * Thin REST client for the bravia-web backend.
 *
 * Every call is attributed to a display by its source IP on the server side --
 * the browser sends nothing identifying, so there is no device id to pass here.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function post(path: string, body: unknown): Promise<void> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let message = `Request failed (HTTP ${res.status}).`;
    try {
      const data = (await res.json()) as { message?: unknown };
      if (typeof data.message === "string") message = data.message;
    } catch {
      /* keep the generic message */
    }
    throw new ApiError(message, res.status);
  }
}

export async function getConfig(): Promise<ClientConfig> {
  const res = await fetch("/api/config", { headers: { Accept: "application/json" } });
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ApiError(`Server returned an unexpected response (HTTP ${res.status}).`, res.status);
  }
  if (!res.ok) {
    const message =
      typeof parsed === "object" && parsed !== null && "message" in parsed
        ? String((parsed as { message: unknown }).message)
        : `HTTP ${res.status}`;
    throw new ApiError(message, res.status);
  }
  return parsed as ClientConfig;
}

export function switchInput(inputId: string): Promise<void> {
  return post("/api/input", { inputId });
}

export function launchApp(appId: string): Promise<void> {
  return post("/api/app", { appId });
}

export function sendCommand(commandId: string): Promise<void> {
  return post("/api/command", { commandId });
}

import { logger } from "./logger";

/**
 * Server-side weather for the TopBar clock area.
 *
 * Fetched and cached here rather than by each display: one external call for
 * the whole fleet, and displays need not reach the internet themselves. Shape
 * matches the frontend's WeatherData.
 */

export interface Weather {
  temperature: number;
  condition: "sunny" | "cloudy" | "rainy" | "snowy" | "thunderstorm";
  isDay: boolean;
}

// Bridgewater, MA
const LAT = 41.9901;
const LON = -70.9748;
const URL = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,weathercode,is_day&temperature_unit=fahrenheit`;
const TTL_MS = 15 * 60 * 1000;

function conditionFor(code: number): Weather["condition"] {
  if (code <= 3) return "sunny";
  if (code >= 45 && code <= 48) return "cloudy";
  if (code >= 51 && code <= 67) return "rainy";
  if (code >= 71 && code <= 86) return "snowy";
  if (code >= 95) return "thunderstorm";
  return "sunny";
}

let cache: { at: number; data: Weather } | null = null;
let inFlight: Promise<Weather> | null = null;

async function fetchWeather(): Promise<Weather> {
  const res = await fetch(URL, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`open-meteo HTTP ${res.status}`);
  const json = (await res.json()) as {
    current?: { temperature_2m?: number; weathercode?: number; is_day?: number };
  };
  const current = json.current;
  if (!current || typeof current.temperature_2m !== "number") {
    throw new Error("open-meteo returned an unexpected payload");
  }
  return {
    temperature: Math.round(current.temperature_2m),
    condition: conditionFor(current.weathercode ?? 0),
    isDay: current.is_day === 1,
  };
}

/**
 * Returns cached weather when fresh. On a stale-but-present cache, serves the
 * stale value if the refresh fails, so a transient outage never blanks the UI.
 */
export async function getWeather(): Promise<Weather> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.data;
  if (inFlight) return inFlight;

  inFlight = fetchWeather()
    .then((data) => {
      cache = { at: Date.now(), data };
      return data;
    })
    .catch((err) => {
      if (cache) {
        logger.warn({ err: String(err) }, "weather refresh failed; serving stale");
        return cache.data;
      }
      throw err;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

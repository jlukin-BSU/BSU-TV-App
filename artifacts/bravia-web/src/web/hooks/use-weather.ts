import { useQuery } from "@tanstack/react-query";

export interface WeatherData {
  temperature: number;
  condition: "sunny" | "cloudy" | "rainy" | "snowy" | "thunderstorm";
  isDay: boolean;
}

/**
 * Weather is fetched and cached by the backend (GET /api/weather), not by each
 * display. Keeps the external call server-side and identical across displays.
 */
export function useWeather() {
  return useQuery({
    queryKey: ["weather"],
    queryFn: async (): Promise<WeatherData> => {
      const res = await fetch("/api/weather", { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error("Failed to fetch weather");
      return (await res.json()) as WeatherData;
    },
    refetchInterval: 15 * 60 * 1000,
    retry: 1,
  });
}

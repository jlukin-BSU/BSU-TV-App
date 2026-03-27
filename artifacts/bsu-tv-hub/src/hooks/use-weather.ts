import { useQuery } from "@tanstack/react-query";

interface WeatherData {
  temperature: number;
  condition: "sunny" | "cloudy" | "rainy" | "snowy" | "thunderstorm";
}

function getWeatherCondition(code: number): WeatherData["condition"] {
  // WMO Weather interpretation codes
  if (code <= 3) return "sunny";
  if (code >= 45 && code <= 48) return "cloudy";
  if (code >= 51 && code <= 67) return "rainy";
  if (code >= 71 && code <= 86) return "snowy";
  if (code >= 95) return "thunderstorm";
  return "sunny"; // fallback
}

export function useWeather() {
  return useQuery({
    queryKey: ["weather", "bridgewater"],
    queryFn: async (): Promise<WeatherData> => {
      // Bridgewater, MA coordinates
      const res = await fetch(
        "https://api.open-meteo.com/v1/forecast?latitude=41.9901&longitude=-70.9748&current=temperature_2m,weathercode&temperature_unit=fahrenheit"
      );
      
      if (!res.ok) throw new Error("Failed to fetch weather");
      
      const data = await res.json();
      
      return {
        temperature: Math.round(data.current.temperature_2m),
        condition: getWeatherCondition(data.current.weathercode),
      };
    },
    // Refetch every 15 minutes
    refetchInterval: 15 * 60 * 1000,
  });
}

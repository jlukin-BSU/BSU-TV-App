import { Cloud, CloudLightning, CloudRain, Snowflake, Sun } from "lucide-react";
import { useTime } from "@/hooks/use-time";
import { useWeather } from "@/hooks/use-weather";
import bsuLogo from "@assets/BSU_Logo_No_Cupola_trans_1774372116116.png";

export function TopBar() {
  const { timeDisplay, dateDisplay } = useTime();
  const { data: weather, isLoading } = useWeather();

  const WeatherIcon = {
    sunny: Sun,
    cloudy: Cloud,
    rainy: CloudRain,
    snowy: Snowflake,
    thunderstorm: CloudLightning,
  }[weather?.condition || "sunny"];

  return (
    <div className="absolute top-0 w-full px-12 py-8 flex justify-between items-center z-10">
      <img
        src={bsuLogo}
        alt="Bridgewater State University"
        className="h-24 w-auto object-contain brightness-0 invert"
      />

      <div className="flex flex-col items-end">
        <div className="text-6xl font-bold tracking-tight text-foreground">{timeDisplay}</div>
        <div className="flex items-center gap-4 mt-2">
          <span className="text-2xl text-foreground/80 font-medium">{dateDisplay}</span>

          <div className="h-6 w-[2px] bg-border rounded-full" />

          <div className="flex items-center gap-2 text-2xl font-medium text-foreground/90">
            {!isLoading && weather && (
              <>
                <WeatherIcon className="w-8 h-8 text-primary" strokeWidth={2.5} />
                <span>{weather.temperature}°F</span>
              </>
            )}
            {isLoading && (
              <div className="animate-pulse w-24 h-8 bg-muted rounded-md" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

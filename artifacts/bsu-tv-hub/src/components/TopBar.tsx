import { Cloud, CloudLightning, CloudRain, Snowflake, Sun } from "lucide-react";
import { useTime } from "@/hooks/use-time";
import { useWeather } from "@/hooks/use-weather";

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
    <div className="absolute top-0 w-full p-12 flex justify-between items-start z-10">
      {/* Branding */}
      <div className="flex flex-col">
        <h1 className="text-primary text-5xl font-extrabold tracking-tight">BSU</h1>
        <h2 className="text-foreground/80 text-xl font-medium mt-1">Bridgewater State University</h2>
      </div>

      {/* Clock & Weather */}
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

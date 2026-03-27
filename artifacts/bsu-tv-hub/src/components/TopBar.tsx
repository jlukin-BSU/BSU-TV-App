import { Cloud, CloudLightning, CloudRain, Snowflake, Sun } from "lucide-react";
import { useTime } from "@/hooks/use-time";
import { useWeather } from "@/hooks/use-weather";
import bsuLogo from "@assets/BSU_Logo_No_Cupola_trans_1774372116116.png";

interface TopBarProps {
  onLogoClick?: () => void;
}

export function TopBar({ onLogoClick }: TopBarProps = {}) {
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
    <div className="absolute top-0 w-full z-30">
      {/* Gradient shield — fully opaque across the header, short fade at the bottom */}
      <div
        className="absolute inset-x-0 top-0 pointer-events-none"
        style={{
          background: "linear-gradient(to bottom, #252525 0%, #252525 78%, transparent 100%)",
          height: "16rem",
        }}
      />
      {/* Logo — adjust `top` and `left` to reposition independently */}
      <img
        src={bsuLogo}
        alt="Bridgewater State University"
        className="absolute w-auto h-36 object-contain brightness-0 invert"
        style={{ top: "2rem", left: "3rem", cursor: "default" }}
        onClick={onLogoClick}
      />

      {/* Clock / date / weather — adjust `top` and `right` to reposition independently */}
      <div
        className="absolute flex flex-col items-end"
        style={{ top: "4.2rem", right: "3rem" }}
      >
        <div className="text-[2.5rem] leading-none font-bold tracking-tight text-foreground">{timeDisplay}</div>
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

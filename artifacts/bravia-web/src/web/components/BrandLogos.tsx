import primeImg from "@assets/brand/prime.png";
import disneyImg from "@assets/brand/disney-plus.svg";
import maxImg from "@assets/brand/max.svg";
import appleImg from "@assets/brand/apple-tv.svg";
import peacockImg from "@assets/brand/peacock.svg";
import paramountImg from "@assets/brand/paramount.svg";
import plutoImg from "@assets/brand/pluto.svg";

/**
 * Official app logos supplied by the user (attached_assets/brand). Each renders
 * inside a light rounded chip so any logo colour -- dark wordmarks (Disney+),
 * full-colour marks (Peacock), single-colour (Paramount+/Pluto) -- stays legible
 * on the dark tiles, and the set looks consistent, like a real app grid.
 */

const src: Record<string, string> = {
  prime: primeImg,
  disneyplus: disneyImg,
  max: maxImg,
  appletv: appleImg,
  peacock: peacockImg,
  paramount: paramountImg,
  pluto: plutoImg,
};

export function hasBrandLogo(key: string): boolean {
  return key in src;
}

export function BrandLogo({ appKey }: { appKey: string }) {
  const img = src[appKey];
  if (!img) return null;
  return (
    <div
      className="flex items-center justify-center rounded-2xl"
      style={{
        background: "#ffffff",
        width: "12rem",
        height: "6.5rem",
        padding: "1rem 1.5rem",
        boxShadow: "0 0.2rem 0.8rem rgba(0,0,0,0.25)",
      }}
    >
      <img src={img} alt="" className="max-w-full max-h-full object-contain" draggable={false} />
    </div>
  );
}

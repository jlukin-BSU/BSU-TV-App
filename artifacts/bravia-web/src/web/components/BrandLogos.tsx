import primeImg from "@assets/brand/prime.png";
import disneyImg from "@assets/brand/disney-plus.svg";
import maxImg from "@assets/brand/max.svg";
import appleImg from "@assets/brand/apple-tv.svg";
import peacockImg from "@assets/brand/peacock.svg";
import paramountImg from "@assets/brand/paramount.svg";
import plutoImg from "@assets/brand/pluto.svg";

/**
 * Official app logos (user-supplied, attached_assets/brand), rendered like the
 * StreamingLogos: transparent, proportional, straight on the dark tile, dimmed
 * slightly when unfocused. Per-logo width keeps each visually balanced despite
 * different aspect ratios.
 *
 * `invert` forces a dark-only logo to solid white so it reads on the dark tile
 * (same trick the utility icons use). Colour logos that already show on dark are
 * left untouched.
 */

interface LogoSpec {
  src: string;
  /** Tailwind width class. */
  width: string;
  /** Force to white for logos that ship only in a dark-on-light variant. */
  invert?: boolean;
}

const logos: Record<string, LogoSpec> = {
  prime: { src: primeImg, width: "w-44", invert: true },
  disneyplus: { src: disneyImg, width: "w-40", invert: true },
  max: { src: maxImg, width: "w-36", invert: true },
  appletv: { src: appleImg, width: "w-28", invert: true },
  peacock: { src: peacockImg, width: "w-40" },
  paramount: { src: paramountImg, width: "w-48" },
  pluto: { src: plutoImg, width: "w-36" },
};

export function hasBrandLogo(key: string): boolean {
  return key in logos;
}

export function BrandLogo({ appKey, focused }: { appKey: string; focused: boolean }) {
  const spec = logos[appKey];
  if (!spec) return null;
  return (
    <img
      src={spec.src}
      alt=""
      draggable={false}
      className={`${spec.width} h-auto object-contain ${spec.invert ? "brightness-0 invert" : ""}`}
      style={{ opacity: focused ? 1 : 0.8 }}
    />
  );
}

import primeImg from "@assets/brand/prime.png";
import disneyImg from "@assets/brand/disney-plus.svg";
import maxImg from "@assets/brand/max.svg";
import appleImg from "@assets/brand/apple-tv.png";
import peacockImg from "@assets/brand/peacock.svg";
import paramountImg from "@assets/brand/paramount.svg";
import plutoImg from "@assets/brand/pluto.svg";
import cnnImg from "@assets/brand/cnn.svg";

/**
 * Official app logos (user-supplied, attached_assets/brand), rendered like the
 * StreamingLogos: in their own colours, transparent, proportional, straight on
 * the dark tile, dimmed slightly when unfocused. Per-logo width keeps each
 * visually balanced despite different aspect ratios.
 */

interface LogoSpec {
  src: string;
  /** Tailwind width class. */
  width: string;
}

const logos: Record<string, LogoSpec> = {
  prime: { src: primeImg, width: "w-56" },
  disneyplus: { src: disneyImg, width: "w-48" },
  max: { src: maxImg, width: "w-36" },
  appletv: { src: appleImg, width: "w-44" },
  peacock: { src: peacockImg, width: "w-52" },
  paramount: { src: paramountImg, width: "w-56" },
  pluto: { src: plutoImg, width: "w-36" },
  cnn: { src: cnnImg, width: "w-36" },
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
      className={`${spec.width} h-auto object-contain`}
      style={{ opacity: focused ? 1 : 0.8 }}
    />
  );
}

import netflixSvg from "@assets/netflix-n_1774585219983.svg";
import huluImg    from "@assets/Hulu-Logo.wine_1774585336589.png";
import tubiImg    from "@assets/tubi_1774584663957.png";

interface LogoProps {
  focused: boolean;
}

/** Netflix — official red wordmark SVG (transparent background) */
export function NetflixLogo({ focused }: LogoProps) {
  return (
    <img
      src={netflixSvg}
      alt="Netflix"
      className="w-60 h-auto object-contain"
      style={{ opacity: focused ? 1 : 0.8 }}
      draggable={false}
    />
  );
}

/** Hulu — green wordmark on black; screen blend removes the black */
export function HuluLogo({ focused }: LogoProps) {
  return (
    <img
      src={huluImg}
      alt="Hulu"
      className="w-52 h-auto object-contain"
      style={{
        opacity: focused ? 1 : 0.85,
        mixBlendMode: "screen",
      }}
      draggable={false}
    />
  );
}

/** Tubi — purple square with yellow wordmark */
export function TubiLogo({ focused }: LogoProps) {
  return (
    <img
      src={tubiImg}
      alt="Tubi"
      className="w-36 h-auto object-contain rounded-xl"
      style={{ opacity: focused ? 1 : 0.8 }}
      draggable={false}
    />
  );
}

import netflixImg from "@assets/netflix_1774584663957.jpg";
import huluImg    from "@assets/Hulu-logo_1774584663957.avif";
import tubiImg    from "@assets/tubi_1774584663957.png";

interface LogoProps {
  focused: boolean;
}

export function NetflixLogo({ focused }: LogoProps) {
  return (
    <img
      src={netflixImg}
      alt="Netflix"
      className="w-64 h-auto object-contain"
      style={{
        opacity: focused ? 1 : 0.85,
        mixBlendMode: "screen",
      }}
      draggable={false}
    />
  );
}

export function HuluLogo({ focused }: LogoProps) {
  return (
    <img
      src={huluImg}
      alt="Hulu"
      className="w-40 h-auto object-contain"
      style={{ opacity: focused ? 1 : 0.8 }}
      draggable={false}
    />
  );
}

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

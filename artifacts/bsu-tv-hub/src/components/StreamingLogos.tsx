interface LogoProps {
  focused: boolean;
}

/** Netflix — the iconic red "N" mark */
export function NetflixLogo({ focused }: LogoProps) {
  return (
    <svg
      viewBox="0 0 40 60"
      className="w-14 h-auto"
      aria-hidden="true"
      style={{ opacity: focused ? 1 : 0.7 }}
    >
      {/* Bold N shape — left bar, diagonal, right bar */}
      <path
        d="M 0 0 L 0 60 L 10 60 L 10 15 L 30 60 L 40 60 L 40 0 L 30 0 L 30 45 L 10 0 Z"
        fill="#E50914"
      />
    </svg>
  );
}

/** Hulu — lowercase green wordmark */
export function HuluLogo({ focused }: LogoProps) {
  return (
    <svg
      viewBox="0 0 108 40"
      className="w-32 h-auto"
      aria-hidden="true"
      style={{ opacity: focused ? 1 : 0.7 }}
    >
      <text
        x="2"
        y="33"
        fontFamily="'Helvetica Neue', 'Arial', sans-serif"
        fontWeight="700"
        fontSize="34"
        fill="#1CE783"
        letterSpacing="-0.5"
      >
        hulu
      </text>
    </svg>
  );
}

/** Tubi — orange-red bold wordmark */
export function TubiLogo({ focused }: LogoProps) {
  return (
    <svg
      viewBox="0 0 90 40"
      className="w-28 h-auto"
      aria-hidden="true"
      style={{ opacity: focused ? 1 : 0.7 }}
    >
      <text
        x="2"
        y="33"
        fontFamily="'Helvetica Neue', 'Arial Black', sans-serif"
        fontWeight="900"
        fontSize="34"
        fill="#FA2D2D"
        letterSpacing="-0.5"
      >
        tubi
      </text>
    </svg>
  );
}

interface LogoProps {
  focused: boolean;
}

export function NetflixLogo({ focused }: LogoProps) {
  return (
    <svg
      viewBox="0 0 54 80"
      className="w-16 h-auto"
      aria-hidden="true"
    >
      <text
        x="2"
        y="74"
        fontFamily="'Georgia', 'Times New Roman', serif"
        fontWeight="900"
        fontStyle="italic"
        fontSize="82"
        fill="#E50914"
        opacity={focused ? 1 : 0.65}
      >
        N
      </text>
    </svg>
  );
}

export function HuluLogo({ focused }: LogoProps) {
  return (
    <svg
      viewBox="0 0 110 42"
      className="w-28 h-auto"
      aria-hidden="true"
    >
      <text
        x="2"
        y="36"
        fontFamily="'Arial Black', 'Arial', sans-serif"
        fontWeight="900"
        fontSize="36"
        fill="#1CE783"
        opacity={focused ? 1 : 0.65}
      >
        hulu
      </text>
    </svg>
  );
}

export function TubiLogo({ focused }: LogoProps) {
  return (
    <svg
      viewBox="0 0 100 42"
      className="w-28 h-auto"
      aria-hidden="true"
    >
      <text
        x="2"
        y="36"
        fontFamily="'Arial Black', 'Arial', sans-serif"
        fontWeight="900"
        fontSize="36"
        fill="#FF6600"
        opacity={focused ? 1 : 0.65}
      >
        tubi
      </text>
    </svg>
  );
}

interface HdmiIconProps {
  className?: string;
  style?: React.CSSProperties;
}

export function HdmiIcon({ className, style }: HdmiIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {/* Outer housing — trapezoid shape of an HDMI port */}
      <path d="M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4l-2 2H4L2 11V7z" />
      {/* Inner connector pins area */}
      <line x1="6" y1="10" x2="6" y2="13" />
      <line x1="9" y1="10" x2="9" y2="13" />
      <line x1="12" y1="10" x2="12" y2="13" />
      <line x1="15" y1="10" x2="15" y2="13" />
      <line x1="18" y1="10" x2="18" y2="13" />
      {/* Cable / stem */}
      <path d="M8 13h8v4H8z" />
    </svg>
  );
}

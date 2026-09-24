interface YouTubeLogoProps {
  className?: string;
  focused?: boolean;
}

export function YouTubeLogo({ className = "", focused = false }: YouTubeLogoProps) {
  return (
    <svg
      viewBox="0 0 90 63"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="YouTube"
    >
      <path
        d="M88.1 9.9C87.1 6.3 84.2 3.5 80.6 2.4C73.6 0.5 45 0.5 45 0.5C45 0.5 16.4 0.5 9.4 2.4C5.8 3.5 2.9 6.3 1.9 9.9C0 16.9 0 31.5 0 31.5C0 31.5 0 46.1 1.9 53.1C2.9 56.7 5.8 59.5 9.4 60.6C16.4 62.5 45 62.5 45 62.5C45 62.5 73.6 62.5 80.6 60.6C84.2 59.5 87.1 56.7 88.1 53.1C90 46.1 90 31.5 90 31.5C90 31.5 90 16.9 88.1 9.9Z"
        fill={focused ? "#FF0000" : "#CC0000"}
      />
      <path
        d="M35.9 44.9L59.3 31.5L35.9 18.1V44.9Z"
        fill="white"
      />
    </svg>
  );
}

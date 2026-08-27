export function SparkMark({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M10 1.7c.55 4.72 3.58 7.75 8.3 8.3-4.72.55-7.75 3.58-8.3 8.3C9.45 13.58 6.42 10.55 1.7 10 6.42 9.45 9.45 6.42 10 1.7Z"
        fill="currentColor"
      />
      <circle cx="16.25" cy="3.75" r="1.35" fill="currentColor" opacity="0.72" />
    </svg>
  );
}

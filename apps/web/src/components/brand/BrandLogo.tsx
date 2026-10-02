// Original placeholder mark (plan.md OQ1): a red disc with a yellow bowl and
// steam. Decorative — the link around it carries the accessible name.
export function BrandLogo({ size = 44 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="24" cy="24" r="24" fill="var(--color-brand-red)" />
      <path
        d="M11 25h26a13 13 0 0 1-26 0Z"
        fill="var(--color-brand-yellow)"
      />
      <rect x="9" y="23" width="30" height="3" rx="1.5" fill="#fff" />
      <path
        d="M19 19c-2-2 2-4 0-7M24 19c-2-2 2-4 0-7M29 19c-2-2 2-4 0-7"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

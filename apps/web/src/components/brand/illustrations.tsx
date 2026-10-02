// Original, decorative SVG illustrations standing in for product
// photography (plan.md OQ1). Every one is aria-hidden: the surrounding text
// already names what it shows.

// A generic plated dish — the card image until the menu carries images
// (Phase 2, imageUrl).
export function FoodIllustration() {
  return (
    <svg viewBox="0 0 160 100" aria-hidden="true" focusable="false">
      <ellipse cx="80" cy="82" rx="62" ry="10" fill="var(--color-border)" />
      <path
        d="M38 62c0-20 19-34 42-34s42 14 42 34Z"
        fill="var(--color-brand-yellow)"
      />
      <circle cx="64" cy="44" r="2" fill="#fff" />
      <circle cx="80" cy="38" r="2" fill="#fff" />
      <circle cx="96" cy="44" r="2" fill="#fff" />
      <rect x="34" y="60" width="92" height="7" rx="3.5" fill="var(--color-veg)" />
      <rect x="36" y="66" width="88" height="7" rx="3.5" fill="var(--color-accent)" />
      <path d="M38 72h84a8 8 0 0 1-8 8H46a8 8 0 0 1-8-8Z" fill="var(--color-brand-yellow-dark)" />
    </svg>
  );
}

// The empty-cart state: a paper bag with a few crumbs above it.
export function EmptyBagIllustration() {
  return (
    <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <g stroke="var(--color-text)" strokeWidth="3" strokeLinecap="round">
        <path d="M40 18l6 6M46 18l-6 6" />
        <path d="M74 14l6 6M80 14l-6 6" />
      </g>
      <circle cx="60" cy="16" r="3" fill="none" stroke="var(--color-text)" strokeWidth="2.5" />
      <circle cx="88" cy="28" r="3" fill="none" stroke="var(--color-text)" strokeWidth="2.5" />
      <path
        d="M32 42l6-6 6 6 6-6 6 6 6-6 6 6 6-6 6 6 6-6 6 6v70H32Z"
        fill="var(--color-accent)"
      />
      <rect x="32" y="92" width="56" height="20" fill="var(--color-brand-red)" />
      <path
        d="M52 70a8 8 0 0 1 16 0"
        stroke="var(--color-brand-yellow)"
        strokeWidth="5"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

// The hero banner's artwork: a stacked burger and a drink.
export function HeroIllustration() {
  return (
    <svg viewBox="0 0 260 180" aria-hidden="true" focusable="false">
      <ellipse cx="130" cy="164" rx="110" ry="10" fill="rgb(0 0 0 / 12%)" />
      <path d="M40 92c0-32 28-52 64-52s64 20 64 52Z" fill="var(--color-brand-yellow)" />
      <rect x="34" y="92" width="140" height="12" rx="6" fill="var(--color-veg)" />
      <rect x="38" y="104" width="132" height="14" rx="7" fill="var(--color-accent-strong)" />
      <rect x="36" y="118" width="136" height="8" rx="4" fill="var(--color-brand-yellow-dark)" />
      <path d="M40 126h128a12 12 0 0 1-12 12H52a12 12 0 0 1-12-12Z" fill="var(--color-brand-yellow)" />
      <path d="M190 70h44l-8 88h-28Z" fill="#fff" />
      <rect x="190" y="96" width="44" height="18" fill="var(--color-brand-red)" />
      <path d="M216 70l10-40" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

// Category thumbnails use the category's initial until categories carry an
// image (Phase 2).
export function CategoryInitial({ name }: { name: string }) {
  return <span aria-hidden="true">{name.trim().charAt(0).toUpperCase()}</span>;
}

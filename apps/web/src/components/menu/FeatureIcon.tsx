import type { MenuItemFeature } from "@contracts/api-contracts";

// The small outline glyph before each "Our Menu" chip, as in the reference
// (docs/features/mcdelivery-parity/reference-inventory.md §1). Decorative.
export function FeatureIcon({ feature, className }: { feature: MenuItemFeature; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      {feature === "popular" && <path d="M8 1.5l1.9 4 4.3.5-3.2 3 .9 4.3L8 11.2l-3.9 2.1.9-4.3-3.2-3 4.3-.5z" />}
      {feature === "deal" && (
        <>
          <circle cx="8" cy="8" r="6.2" />
          <path d="M5.5 10.5l5-5M6 6h.01M10 10h.01" />
        </>
      )}
      {feature === "new-launch" && (
        <path d="M8 1.5v4M8 10.5v4M1.5 8h4M10.5 8h4M4 4l1.6 1.6M10.4 10.4 12 12M12 4l-1.6 1.6M5.6 10.4 4 12" />
      )}
    </svg>
  );
}

"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "../../lib/state/cartStore";
import { BRAND_NAME } from "../../lib/brand";
import { BrandLogo } from "../brand/BrandLogo";
import { VoiceLauncher } from "../voice/VoiceShell";
import styles from "./SiteNav.module.css";

// The sticky site header (docs/features/mcdelivery-redesign/plan.md,
// Phase 1). Delivery mode, location, "Now", Offers, Restaurants Nearby and
// account are visual placeholders with no behaviour yet (OQ2 (a)): they stay
// focusable, announce themselves as unavailable, and do nothing. `label`
// is the visible text it starts with, so the visible label is always part of
// the accessible name.
function Placeholder({
  className,
  label,
  children,
}: {
  className?: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={className}
      aria-disabled="true"
      aria-label={`${label} (coming soon)`}
      title="Coming soon"
    >
      {children}
    </button>
  );
}

export function SiteNav() {
  const pathname = usePathname();
  // The count appears once commerce-api has answered — never a guessed 0
  // while the cart is still loading or could not be loaded.
  const { itemCount, status } = useCart();

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand} aria-label={`${BRAND_NAME} home`}>
          <BrandLogo />
          <span className={styles.brandName}>{BRAND_NAME}</span>
        </Link>

        <Placeholder className={styles.modePill} label="Delivery">
          <span>Delivery</span>
          <span aria-hidden="true">▾</span>
        </Placeholder>

        {/* The whole visible text is in the name (WCAG 2.5.3; Lighthouse
            label-content-name-mismatch at final review). */}
        <Placeholder
          className={styles.locationPill}
          label="Set your location to see delivery options near you, Now"
        >
          <span className={styles.locationText}>
            <strong>Set your location</strong>
            <span>to see delivery options near you</span>
          </span>
          <span className={styles.when}>Now</span>
        </Placeholder>

        <div className={styles.spacer} />

        <Placeholder className={styles.textLink} label="Offers">
          Offers
        </Placeholder>
        <Placeholder className={styles.textLink} label="Restaurants Nearby">
          Restaurants Nearby
        </Placeholder>

        {/* mcdelivery-redesign Phase 5: the voice-first entry point, on
            every route. Renders nothing without the shell or speech support. */}
        <VoiceLauncher className={styles.voice} />

        <nav className={styles.nav} aria-label="Primary">
          <Link href="/" aria-current={pathname === "/" ? "page" : undefined}>
            Menu
          </Link>
          <Link
            href="/cart"
            className={styles.cartLink}
            aria-current={pathname === "/cart" ? "page" : undefined}
          >
            {status === "ready" ? `Cart (${itemCount})` : "Cart"}
          </Link>
        </nav>

        <Placeholder className={styles.iconButton} label="Account">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
          </svg>
        </Placeholder>
      </div>
    </header>
  );
}

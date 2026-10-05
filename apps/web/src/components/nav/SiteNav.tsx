"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "../../lib/state/cartStore";
import { BRAND_NAME } from "../../lib/brand";
import { BrandLogo } from "../brand/BrandLogo";
import { VoiceLauncher } from "../voice/VoiceShell";
import { MobileToolbar } from "./MobileToolbar";
import { BackHeader } from "./BackHeader";
import styles from "./SiteNav.module.css";

// The sticky site header (docs/features/mcdelivery-redesign/plan.md,
// Phase 1). Delivery mode, location and "Now" are visual placeholders with
// no behaviour yet (OQ2 (a)): they stay focusable, announce themselves as
// unavailable, and do nothing. Offers, Restaurants Nearby and the account
// icon became links when their pages arrived (mcdelivery-parity Phase 4). `label`
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

// Thin-stroke outline icons, as in the reference header
// (docs/features/mcdelivery-parity/reference-inventory.md §1). Decorative:
// the control around each one carries the name.
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

// Below 1200px the home and menu pages get the red toolbar and every other
// page the "‹ Back" bar (mcdelivery-parity AC4).
function hasToolbar(pathname: string): boolean {
  return pathname === "/" || pathname === "/menu" || pathname.startsWith("/menu/");
}

export function SiteNav() {
  const pathname = usePathname();
  // The count appears once commerce-api has answered — never a guessed 0
  // while the cart is still loading or could not be loaded.
  const { itemCount, status } = useCart();
  const ready = status === "ready";

  return (
    <header className={styles.header}>
      {/* One layout per breakpoint, switched in CSS (AC3): the inactive
          one is display: none, so it is out of the accessibility tree. */}
      <div className={styles.inner} data-layout="desktop">
        <Link href="/" className={styles.brand} aria-label={`${BRAND_NAME} home`}>
          <BrandLogo />
          <span className={styles.brandName}>{BRAND_NAME}</span>
        </Link>

        <Placeholder className={styles.modePill} label="Delivery">
          <span className={styles.modeIcon}>
            <Icon>
              <circle cx="6" cy="17" r="2.5" />
              <circle cx="18" cy="17" r="2.5" />
              <path d="M8.5 17h7M4 13h7l2 4M13 7h3l3 7M15 4h3v3h-3z" />
            </Icon>
          </span>
          <span>Delivery</span>
          <span aria-hidden="true" className={styles.chevron}>
            ▾
          </span>
        </Placeholder>

        {/* Named by its own content, not an aria-label: the second line
            can be cut short with an ellipsis, and a hand-written name then
            no longer matches what is visible (WCAG 2.5.3; Lighthouse
            label-content-name-mismatch, mcdelivery-parity Phase 5). The
            explicit spaces keep the words apart in the computed name. */}
        <button
          type="button"
          className={styles.locationPill}
          aria-disabled="true"
          title="Coming soon"
        >
          <span className={styles.pin}>
            <Icon>
              <path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z" />
              <circle cx="12" cy="10" r="2" />
            </Icon>
          </span>
          <span className={styles.locationText}>
            <strong>Set your location</strong>{" "}
            <span>to see delivery options near you</span>
          </span>{" "}
          <span className={styles.when}>
            <span className={styles.clock}>
              <Icon>
                <circle cx="12" cy="12" r="8" />
                <path d="M12 8v4l3 2" />
              </Icon>
            </span>
            Now
          </span>{" "}
          <span className={styles.visuallyHidden}>(coming soon)</span>
        </button>

        <div className={styles.spacer} />

        <span className={styles.divider} aria-hidden="true" />

        {/* Real pages since mcdelivery-parity Phase 4 (AC2). */}
        <Link
          href="/offers"
          className={styles.textLink}
          aria-current={pathname === "/offers" ? "page" : undefined}
        >
          Offers
        </Link>
        <Link
          href="/restaurants-nearby"
          className={styles.textLink}
          aria-current={pathname === "/restaurants-nearby" ? "page" : undefined}
        >
          Restaurants Nearby
        </Link>

        {/* mcdelivery-redesign Phase 5: the voice-first entry point, on
            every route. Renders nothing without the shell or speech support. */}
        <VoiceLauncher className={styles.voice} />

        <Link
          href="/profile"
          className={styles.iconButton}
          aria-label="Account"
          aria-current={pathname === "/profile" ? "page" : undefined}
        >
          <Icon>
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
          </Icon>
        </Link>

        <nav className={styles.nav} aria-label="Primary">
          <Link
            href="/search"
            className={styles.iconButton}
            aria-label="Search"
            aria-current={pathname === "/search" ? "page" : undefined}
          >
            <Icon>
              <circle cx="11" cy="11" r="6.5" />
              <path d="m16 16 4.5 4.5" />
            </Icon>
          </Link>
          {/* The name keeps the count in words; the badge shows the same
              number, so the visible text stays part of the name. */}
          <Link
            href="/cart"
            className={styles.cartLink}
            aria-label={ready ? `Cart (${itemCount})` : "Cart"}
            aria-current={pathname === "/cart" ? "page" : undefined}
          >
            <Icon>
              <path d="M3 4h2.5l2.2 10.5h10.6L20.5 7H7" />
              <circle cx="9.5" cy="19" r="1.5" />
              <circle cx="17" cy="19" r="1.5" />
            </Icon>
            {ready && <span className={styles.badge}>{itemCount}</span>}
          </Link>
        </nav>
      </div>
      <div className={styles.mobile} data-layout="mobile">
        {hasToolbar(pathname) ? <MobileToolbar /> : <BackHeader />}
      </div>
    </header>
  );
}

"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "../../lib/state/cartStore";
import { formatCents } from "../../lib/money";
import styles from "./MobileTabBar.module.css";

// The reference's floating bottom tab bar below 1200px (docs/features/
// mcdelivery-parity/reference-inventory.md M1; AC4). Hidden in CSS on
// desktop, where the header holds the same links, and not shown during
// checkout, which has its own actions.
type Tab = { href: string; label: string; current: (path: string) => boolean; icon: ReactNode };

const TABS: readonly Tab[] = [
  {
    href: "/",
    label: "Home",
    current: (path) => path === "/",
    icon: <path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z" />,
  },
  {
    href: "/menu",
    label: "Menu",
    current: (path) => path === "/menu" || path.startsWith("/menu/") || path.startsWith("/tag/"),
    icon: <path d="M6 8h12l-1 12H7zM9 8V6a3 3 0 0 1 6 0v2" />,
  },
  {
    href: "/search",
    label: "Search",
    current: (path) => path === "/search",
    icon: (
      <>
        <circle cx="11" cy="11" r="6.5" />
        <path d="m16 16 4.5 4.5" />
      </>
    ),
  },
  {
    href: "/profile",
    label: "Account",
    current: (path) => path === "/profile",
    icon: <path d="M4 7h16M4 12h16M4 17h16" />,
  },
];

// Pages that render CartPanel, whose own bar already sits above the tabs.
function hasCartPanel(path: string): boolean {
  return path === "/" || path.startsWith("/menu/");
}

export function MobileTabBar() {
  const pathname = usePathname();
  const { cart } = useCart();

  if (pathname === "/checkout") {
    return null;
  }

  // Backend-confirmed figures only, and only once there is something in
  // the cart — never a guessed 0 (Phase 11).
  const showCartBar =
    !hasCartPanel(pathname) && pathname !== "/cart" && cart !== null && cart.items.length > 0;

  return (
    <div className={styles.dock}>
      {showCartBar && (
        <Link href="/cart" className={styles.cartBar}>
          <span>
            {cart.itemCount} {cart.itemCount === 1 ? "item" : "items"} ·{" "}
            {formatCents(cart.subtotalCents)}
          </span>
          <strong>View cart</strong>
        </Link>
      )}
      <nav className={styles.tabs} aria-label="Tabs">
        {TABS.map((tab) => {
          const current = tab.current(pathname);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={styles.tab}
              aria-current={current ? "page" : undefined}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                {tab.icon}
              </svg>
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

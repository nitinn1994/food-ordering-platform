// The footer's link row (docs/features/mcdelivery-parity/plan.md, AC11).
// Every href is an in-app route. The reference's off-site and
// out-of-scope links (corporate site, bug bounty, nutrition PDF, the
// all-restaurants directory) are deliberately not listed, rather than
// shown as dead links.
export type FooterLink = { label: string; href: string };

export const FOOTER_LINKS: readonly FooterLink[] = [
  { label: "Privacy Policy", href: "/privacy-policy" },
  { label: "Terms & Conditions", href: "/terms-and-conditions" },
  { label: "FAQ", href: "/faq" },
  { label: "About Us", href: "/about" },
  { label: "Site Map", href: "/sitemap" },
  { label: "Offers", href: "/offers" },
  { label: "Restaurants Nearby", href: "/restaurants-nearby" },
];

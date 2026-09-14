import type { Metadata } from "next";
import type { ReactNode } from "react";
import { UiProvider } from "../lib/state/uiStore";
import { CartProvider } from "../lib/state/cartStore";
import { SiteNav } from "../components/nav/SiteNav";
import { CartAnnouncer } from "../components/cart/CartAnnouncer";
import "./globals.css";

export const metadata: Metadata = {
  title: "Food Ordering Platform",
  description: "Voice, text, and touch food ordering — frontend foundation.",
};

// Providers live here rather than in page.tsx so cart (and UI) state
// survives navigating between routes — e.g. / and /cart. See
// docs/features/phase-3-frontend-cart-simulation/plan.md.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <UiProvider>
          <CartProvider>
            <SiteNav />
            <CartAnnouncer />
            {children}
          </CartProvider>
        </UiProvider>
      </body>
    </html>
  );
}

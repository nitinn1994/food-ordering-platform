import type { Metadata } from "next";
import type { ReactNode } from "react";
import { UiProvider } from "../lib/state/uiStore";
import { CartProvider } from "../lib/state/cartStore";
import { NudgeProvider } from "../lib/nudges/NudgeProvider";
import { AgentTurnProvider } from "../lib/agent/AgentTurnProvider";
import { VoiceShell } from "../components/voice/VoiceShell";
import { SiteNav } from "../components/nav/SiteNav";
import { CartAnnouncer } from "../components/cart/CartAnnouncer";
import { BRAND_NAME, BRAND_TAGLINE } from "../lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: BRAND_NAME,
  description: `${BRAND_TAGLINE} — food ordering.`,
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
            <NudgeProvider>
              {/* mcdelivery-redesign Phase 5: one turn and one voice
                  session for every route. */}
              <AgentTurnProvider>
                <VoiceShell>
                  <SiteNav />
                  <CartAnnouncer />
                  {children}
                </VoiceShell>
              </AgentTurnProvider>
            </NudgeProvider>
          </CartProvider>
        </UiProvider>
      </body>
    </html>
  );
}

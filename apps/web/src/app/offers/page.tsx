import type { Metadata } from "next";
import { StaticPage } from "../../components/layout/StaticPage";
import { OfferGrid } from "../../components/offers/OfferGrid";
import { BRAND_NAME } from "../../lib/brand";

export const metadata: Metadata = { title: `Offers — ${BRAND_NAME}` };

// mcdelivery-parity AC9, OQ3 (a).
export default function OffersPage() {
  return (
    <StaticPage title="Offers" intro="Demo offers — shown for illustration, not redeemable." wide>
      <OfferGrid />
    </StaticPage>
  );
}

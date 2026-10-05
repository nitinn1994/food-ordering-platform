import type { Metadata } from "next";
import { StaticPage } from "../../components/layout/StaticPage";
import { StoreList } from "../../components/stores/StoreList";
import { DEMO_STORES } from "../../lib/content/stores";
import { BRAND_NAME } from "../../lib/brand";

export const metadata: Metadata = { title: `Restaurants Nearby — ${BRAND_NAME}` };

// mcdelivery-parity AC10, OQ5 (a): a static demo list, no geolocation.
export default function RestaurantsNearbyPage() {
  return (
    <StaticPage title="Restaurants Nearby" intro="Demo data — sample locations, not real restaurants.">
      <StoreList stores={DEMO_STORES} />
    </StaticPage>
  );
}

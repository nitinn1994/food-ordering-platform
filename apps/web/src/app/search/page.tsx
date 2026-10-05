import type { Metadata } from "next";
import { StaticPage } from "../../components/layout/StaticPage";
import { SearchView } from "../../components/search/SearchView";
import { ItemDetailPanel } from "../../components/menu/ItemDetailPanel";
import { getMenu } from "../../lib/menu/menuSource";
import { BRAND_NAME } from "../../lib/brand";

// mcdelivery-parity AC8. Per request: the menu is commerce-api's.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: `Search — ${BRAND_NAME}` };

export default async function SearchPage() {
  const categories = await getMenu();
  return (
    <StaticPage title="Search" wide>
      <SearchView categories={categories} />
      <ItemDetailPanel categories={categories} />
    </StaticPage>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MenuItemCard } from "../../../components/menu/MenuItemCard";
import { ItemDetailPanel } from "../../../components/menu/ItemDetailPanel";
import { ItemDetailNudge } from "../../../components/nudges/ItemDetailNudge";
import { getMenu } from "../../../lib/menu/menuSource";
import { FEATURE_LABELS, featuredItems, isMenuItemFeature } from "../../../lib/menu/featured";
import { BRAND_NAME } from "../../../lib/brand";
import styles from "./page.module.css";

// A featured list — Popular, Deals, New Launch — as the reference's
// tag-wise menu (docs/features/mcdelivery-parity/reference-inventory.md §3;
// AC6): a title band, then a grid of the same cards as the menu, 4 across
// on desktop. Only the contract's features are pages; anything else is a
// 404.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ feature: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { feature } = await params;
  return {
    title: isMenuItemFeature(feature) ? `${FEATURE_LABELS[feature]} — ${BRAND_NAME}` : BRAND_NAME,
  };
}

export default async function TagPage({ params }: Props) {
  const { feature } = await params;
  if (!isMenuItemFeature(feature)) {
    notFound();
  }
  const categories = await getMenu();
  const items = featuredItems(categories, feature);

  return (
    <main>
      <div className={styles.band}>
        <h1 className={styles.title}>{FEATURE_LABELS[feature]}</h1>
      </div>
      <div className={styles.container}>
        {items.length === 0 ? (
          <p role="status">Nothing here right now — have a look at the full menu.</p>
        ) : (
          <ul className={styles.grid}>
            {items.map((item) => (
              <MenuItemCard key={item.id} item={item} />
            ))}
          </ul>
        )}
      </div>
      <ItemDetailPanel categories={categories}>
        <ItemDetailNudge />
      </ItemDetailPanel>
    </main>
  );
}

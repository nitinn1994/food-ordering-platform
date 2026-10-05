import Link from "next/link";
import type { MenuCategory, MenuItemFeature } from "@contracts/api-contracts";
import { availableFeatures, FEATURE_LABELS } from "../../lib/menu/featured";
import styles from "./QuickPicks.module.css";

// The reference's mobile "Quick Picks" row (docs/features/mcdelivery-parity/
// reference-inventory.md M1). Each tile opens that feature's page,
// /tag/[feature], like the desktop "Our Menu" chips (Phase 3). Only
// features the menu can satisfy.
const ART: Readonly<Record<MenuItemFeature, string>> = {
  popular: "/menu/burger.svg",
  deal: "/menu/meal.svg",
  "new-launch": "/menu/wrap.svg",
};

export function QuickPicks({ categories }: { categories: readonly MenuCategory[] }) {
  const features = availableFeatures(categories);

  if (features.length === 0) {
    return null;
  }

  return (
    <section className={styles.picks} aria-labelledby="quick-picks-title">
      <h2 id="quick-picks-title" className={styles.title}>
        Quick Picks
      </h2>
      <ul className={styles.row}>
        {features.map((feature) => (
          <li key={feature}>
            <Link href={`/tag/${feature}`} className={styles.tile}>
              <img src={ART[feature]} alt="" width={120} height={90} />
              <span className={styles.label}>{FEATURE_LABELS[feature]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

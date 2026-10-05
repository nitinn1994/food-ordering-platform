import Link from "next/link";
import type { MenuCategory } from "@contracts/api-contracts";
import { MenuSearch } from "../menu/MenuSearch";
import { FeatureIcon } from "../menu/FeatureIcon";
import { availableFeatures, FEATURE_LABELS } from "../../lib/menu/featured";
import styles from "./MenuBand.module.css";

// The reference design's "Our Menu" band: the page heading with the
// Popular / Deals / New Launch chips under it on the left, the search box
// on the right. Each chip opens that feature's page, /tag/[feature], as on
// the reference (docs/features/mcdelivery-parity/plan.md, Phase 3). Only
// the features some item carries are offered.
export function MenuBand({ categories }: { categories: readonly MenuCategory[] }) {
  const features = availableFeatures(categories);

  return (
    <div className={styles.band}>
      <div className={styles.heading}>
        <h1 className={styles.title}>Our Menu</h1>
        {features.length > 0 && (
          <nav aria-label="Featured">
            <ul className={styles.chips}>
              {features.map((feature) => (
                <li key={feature}>
                  <Link href={`/tag/${feature}`} className={styles.chip}>
                    <FeatureIcon feature={feature} className={styles.chipIcon} />
                    {FEATURE_LABELS[feature]}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
      <div className={styles.search}>
        <MenuSearch />
      </div>
    </div>
  );
}

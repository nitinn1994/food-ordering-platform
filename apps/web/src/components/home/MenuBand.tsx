import { MenuSearch } from "../menu/MenuSearch";
import styles from "./MenuBand.module.css";

// The reference design's "Our Menu" band: the page heading on the left, the
// search box on the right. The Popular / Deals / New Launch chips sit at the
// top of MenuList instead, next to the Veg chips, so they can share its
// local filter state (docs/features/mcdelivery-redesign/plan.md Phase 2).
export function MenuBand() {
  return (
    <div className={styles.band}>
      <h1 className={styles.title}>Our Menu</h1>
      <div className={styles.search}>
        <MenuSearch />
      </div>
    </div>
  );
}

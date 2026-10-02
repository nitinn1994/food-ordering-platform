import { BRAND_TAGLINE } from "../../lib/brand";
import { HeroIllustration } from "../brand/illustrations";
import styles from "./HeroBanner.module.css";

// A single static promotional banner in the reference design's hero slot
// (plan.md Phase 1: static slides, no carousel library). Original copy and
// artwork (OQ1).
export function HeroBanner() {
  return (
    <section className={styles.hero} aria-label="Featured">
      <div className={styles.copy}>
        <p className={styles.eyebrow}>Hot, fresh and fast</p>
        <p className={styles.headline}>Your favourites, delivered.</p>
        <p className={styles.tagline}>{BRAND_TAGLINE}.</p>
      </div>
      <div className={styles.art}>
        <HeroIllustration />
      </div>
    </section>
  );
}

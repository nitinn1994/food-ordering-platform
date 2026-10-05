import { BrandLogo } from "../brand/BrandLogo";
import styles from "./AppBand.module.css";

// The reference's yellow "discover with us" band above the footer
// (docs/features/mcdelivery-parity/reference-inventory.md §1). There is no
// app and no QR code (plan.md Phase 1), so the call to action is the same
// focusable, unavailable placeholder the header uses.
export function AppBand() {
  return (
    <section className={styles.band} aria-labelledby="app-band-title">
      <div className={styles.mark}>
        <BrandLogo size={120} />
      </div>
      <div className={styles.copy}>
        <p className={styles.eyebrow}>Discover with us</p>
        <h2 id="app-band-title" className={styles.title}>
          Order by voice, text or touch.
        </h2>
        <p className={styles.text}>Tell us what you fancy and we will handle the rest.</p>
        <button
          type="button"
          className={styles.cta}
          aria-disabled="true"
          aria-label="Get the app (coming soon)"
          title="Coming soon"
        >
          Get the app
        </button>
      </div>
    </section>
  );
}

import styles from "./MobileToolbar.module.css";

// The reference's mobile toolbar (docs/features/mcdelivery-parity/
// reference-inventory.md M1): red, rounded at the bottom, with the
// Delivery / Take Away switch and the location and time rows. Only delivery
// exists, so "Delivery" is shown as the current mode and the rest are the
// header's focusable, unavailable placeholders (redesign OQ2 (a)). Names
// differ from the desktop header's so the two never collide.
function Placeholder({
  className,
  label,
  children,
}: {
  className?: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={className}
      aria-disabled="true"
      aria-label={`${label} (coming soon)`}
      title="Coming soon"
    >
      {children}
    </button>
  );
}

export function MobileToolbar() {
  return (
    <div className={styles.toolbar}>
      <div className={styles.switch} role="group" aria-label="Order type">
        <span className={styles.current}>Delivery</span>
        <Placeholder className={styles.option} label="Take Away">
          Take Away
        </Placeholder>
      </div>
      <div className={styles.row}>
        {/* The whole visible text is in the name (WCAG 2.5.3; Lighthouse
            label-content-name-mismatch, mcdelivery-parity Phase 5). */}
        <Placeholder
          className={styles.location}
          label="Set your location to see delivery options near you"
        >
          <span className={styles.city}>
            Set your location <span aria-hidden="true">▾</span>
          </span>
          <span className={styles.address}>to see delivery options near you</span>
        </Placeholder>
        <Placeholder className={styles.when} label="Now">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <circle cx="12" cy="12" r="8" />
            <path d="M12 8v4l3 2" />
          </svg>
          Now <span aria-hidden="true">▾</span>
        </Placeholder>
      </div>
    </div>
  );
}

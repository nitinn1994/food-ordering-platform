"use client";

import { useRouter } from "next/navigation";
import styles from "./BackHeader.module.css";

// The reference's mobile inner-page header (docs/features/mcdelivery-parity/
// reference-inventory.md M5, M6): a single "‹ Back" control. Back goes to
// the previous page when there is one in this tab's history, else home —
// a direct visit to /cart must not leave the site.
export function BackHeader() {
  const router = useRouter();

  return (
    <div className={styles.bar}>
      <button
        type="button"
        className={styles.back}
        onClick={() => {
          if (window.history.length > 1) {
            router.back();
          } else {
            router.push("/");
          }
        }}
      >
        <span aria-hidden="true">‹</span> Back
      </button>
    </div>
  );
}

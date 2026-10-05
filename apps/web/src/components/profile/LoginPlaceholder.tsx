"use client";

import { useId, useState } from "react";
import { Overlay } from "../ui/Overlay";
import styles from "./LoginPlaceholder.module.css";

// The reference's sign-in modal, as a visual placeholder only
// (docs/features/mcdelivery-parity/requirements.md OQ4 (a), AC12): the
// mobile number field and "Verify Mobile" are disabled, there is no form,
// and nothing is ever collected or sent. Production authentication is out
// of scope (CLAUDE.md).
export function LoginPlaceholder() {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const inputId = useId();
  const noticeId = useId();

  return (
    <>
      <button type="button" className={styles.trigger} onClick={() => setOpen(true)}>
        Log in / Sign up
      </button>
      {open && (
        <Overlay labelledBy={titleId} onClose={() => setOpen(false)}>
          <div className={styles.panel}>
            <button
              type="button"
              className={styles.close}
              aria-label="Close"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
            <h2 id={titleId} className={styles.title}>
              Hi there!
            </h2>
            <p id={noticeId} className={styles.notice} role="note">
              Sign-in is not available in this demo. You can order as a guest.
            </p>
            <label htmlFor={inputId} className={styles.label}>
              Mobile number
            </label>
            <input
              id={inputId}
              className={styles.input}
              type="tel"
              disabled
              aria-describedby={noticeId}
              placeholder="Not available in this demo"
            />
            <button type="button" className={styles.verify} disabled aria-describedby={noticeId}>
              Verify Mobile
            </button>
          </div>
        </Overlay>
      )}
    </>
  );
}

"use client";

import { useId, useState } from "react";
import styles from "./DeliveryNote.module.css";

// The reference's delivery instructions box (docs/features/
// mcdelivery-parity/requirements.md AC13). Local only: the order contract
// has no instructions field, so the note is not sent, and the page says so
// rather than letting the customer believe the kitchen will read it.
export function DeliveryNote() {
  const [note, setNote] = useState("");
  const id = useId();
  const hintId = useId();

  return (
    <div className={styles.note}>
      <label htmlFor={id} className={styles.label}>
        Delivery instructions
      </label>
      <textarea
        id={id}
        className={styles.input}
        rows={3}
        maxLength={200}
        value={note}
        aria-describedby={hintId}
        placeholder="e.g. Ring the bell twice"
        onChange={(event) => setNote(event.target.value)}
      />
      <p id={hintId} className={styles.hint}>
        Not sent with your order in this demo.
      </p>
    </div>
  );
}

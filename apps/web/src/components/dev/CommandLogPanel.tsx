"use client";

import { useUi } from "../../lib/state/uiStore";
import styles from "./CommandLogPanel.module.css";

// Development-only. Makes the allowlist's accept/reject behaviour
// observable — see docs/product/food-ordering-frontend-mvp.md §3, item 6.
// Whether this ships beyond development is an open product question (§8.3).
export function CommandLogPanel() {
  const { commandLog } = useUi();

  return (
    <section className={styles.panel} aria-label="Command log (development)">
      <h2>Command log</h2>
      {commandLog.length === 0 ? (
        <p>No commands processed yet.</p>
      ) : (
        <ul className={styles.entries}>
          {commandLog.map((entry, index) => (
            <li
              key={`${entry.receivedAt}-${index}`}
              className={
                entry.status === "accepted" ? styles.accepted : styles.rejected
              }
            >
              {entry.status === "accepted" ? (
                <span>accepted: {entry.command.type}</span>
              ) : (
                <span>rejected: {entry.reason}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

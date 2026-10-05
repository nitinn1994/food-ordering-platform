"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./Overlay.module.css";

// The one modal primitive (docs/features/mcdelivery-parity/plan.md,
// Approach): the native <dialog> opened with showModal(), so the browser
// supplies the focus trap, Escape, the inert page behind and the top layer.
// A centred modal over a blurred page at 1200px and wider, a bottom sheet
// with a drag handle below (reference-inventory.md §4, M3; AC7).
//
// Mounted means open: render it while there is something to show, and stop
// rendering it to close. Escape and a click on the backdrop ask to close
// through onClose. On unmount, focus goes back to whatever had it when the
// overlay opened.
export function Overlay({
  onClose,
  labelledBy,
  children,
}: {
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const element = dialog.current;
    if (element === null) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element.showModal();
    return () => {
      if (element.open) element.close();
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      className={styles.overlay}
      aria-labelledby={labelledBy}
      // Escape closes the dialog natively; keep `open` in step with React
      // by letting the owner unmount it instead.
      onCancel={(event) => {
        event.preventDefault();
        onCloseRef.current();
      }}
      onClick={(event) => {
        // A click on the dialog box itself, outside its content, is the
        // backdrop.
        if (event.target === event.currentTarget) {
          onCloseRef.current();
        }
      }}
    >
      <div className={styles.content}>
        <span className={styles.handle} aria-hidden="true" />
        {children}
      </div>
    </dialog>
  );
}

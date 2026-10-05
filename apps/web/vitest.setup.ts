import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// RTL's automatic afterEach cleanup relies on a global `afterEach`, which
// only exists if vitest.config.ts sets test.globals: true. This project
// deliberately does not (every other test file explicitly imports from
// "vitest"), so cleanup is wired up by hand instead.
afterEach(() => {
  cleanup();
});

// jsdom has no HTMLDialogElement.showModal()/close() (jsdom 30). A minimal
// stand-in for components/ui/Overlay: it toggles `open`, fires `close`, and
// turns Escape into `cancel` — all the component relies on. Focus
// trapping, inertness and the top layer are the browser's and are checked
// in a real browser instead (docs/features/mcdelivery-parity/test-plan.md).
if (typeof HTMLDialogElement !== "undefined" && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
    // Like the browser: focus moves into the dialog, and Escape anywhere
    // asks the open dialog to cancel.
    this.querySelector<HTMLElement>("button, [href], input, select, textarea")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (!this.isConnected || !this.hasAttribute("open")) {
        document.removeEventListener("keydown", onKeyDown);
        return;
      }
      if (event.key === "Escape") this.dispatchEvent(new Event("cancel", { cancelable: true }));
    };
    document.addEventListener("keydown", onKeyDown);
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}

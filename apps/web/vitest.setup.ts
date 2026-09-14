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

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // No component tests exist yet — those land in sub-phases 1.3/1.4,
    // which is also when this environment becomes "jsdom".
    passWithNoTests: true,
  },
});

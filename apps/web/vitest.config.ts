import { defineConfig } from "vitest/config";

export default defineConfig({
  // Vite's default esbuild JSX transform is "classic" (React.createElement),
  // which needs `React` in scope. Next.js's own SWC compiler doesn't have
  // this requirement, so nothing surfaced this until a test first rendered
  // a component. "automatic" matches Next.js's actual JSX runtime.
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    passWithNoTests: true,
  },
});

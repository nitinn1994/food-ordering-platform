import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Vitest's default esbuild transform does not emit
  // `emitDecoratorMetadata` (esbuild has no such option), so without this
  // plugin Nest's type-based constructor injection silently resolves to
  // `undefined` instead of failing loudly — see plan.md, Phase 6.1 / OD1.
  // `module: { type: "es6" }` keeps SWC's output ESM, matching this
  // package's `"type": "module"`; `experimentalDecorators` and
  // `emitDecoratorMetadata` are read from tsconfig.json (unplugin-swc's
  // documented default), not repeated here.
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    passWithNoTests: true,
  },
});

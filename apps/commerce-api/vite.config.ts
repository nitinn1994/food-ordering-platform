import { builtinModules } from "node:module";
import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import swc from "unplugin-swc";
import { defineConfig } from "vite";

const NODE_BUILTINS = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]);

export default defineConfig({
  // Same SWC transform as vitest.config.ts, reading the same tsconfig.json
  // decorator options — one pipeline for tests and the built runtime
  // (plan.md, Phase 6, OD1).
  plugins: [swc.vite({ module: { type: "es6" } })],
  build: {
    ssr: true,
    target: "node20",
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: fileURLToPath(new URL("./src/main.ts", import.meta.url)),
      output: {
        format: "es",
        entryFileNames: "main.js",
      },
      // packages/contracts/* ship raw TypeScript with no build output of
      // their own (their `exports` field points straight at `./src/index.ts`
      // — see packages/contracts/tools/resolve-relative-ts.mjs). Bundling
      // them inline is how this runtime consumes that source unmodified.
      // Every other dependency (@nestjs/*, express, zod, rxjs, including
      // @contracts/*'s own dependency on zod) stays external and is loaded
      // from node_modules at runtime, the same as any ordinary Node app.
      external(id) {
        if (id.startsWith(".") || isAbsolute(id)) {
          // Relative specifiers, and specifiers already resolved to an
          // absolute path (this package's own src/, and packages/contracts/
          // */src/ once Rollup resolves through the @contracts/* package
          // entry below) are always bundled.
          return false;
        }
        if (NODE_BUILTINS.has(id)) {
          return true;
        }
        return !id.startsWith("@contracts/");
      },
    },
  },
});

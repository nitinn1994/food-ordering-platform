// A Node module-resolution hook, used only by each contracts package's
// `build` script, via the registrar in `./register-relative-ts.mjs`
// (`node --import ../tools/register-relative-ts.mjs scripts/emit-schema.ts`)
// — never imported from src, never part of any package's public exports,
// and never reached by tsc or Vitest.
//
// This file is not the entry point: `node --import` alone runs a file as a
// preload script and does not activate its exports as hooks. Only
// `register-relative-ts.mjs`'s explicit `register()` call does that. Passing
// this file directly to `--import` would silently install nothing and
// reintroduce the exact resolution failure below.
//
// Why this exists: every contracts package's src/*.ts uses extensionless
// relative imports ("./version", not "./version.ts") — required, not a
// style choice, because apps/web's tsconfig (moduleResolution: "Bundler",
// no allowImportingTsExtensions) type-checks these files transitively
// whenever it resolves @contracts/ui-commands, and TypeScript rejects a
// ".ts" extension in that mode. Vitest and tsc both resolve the
// extensionless form correctly on their own (Bundler-style resolution).
// Plain Node does not: Node's native TypeScript execution (used to run
// scripts/emit-schema.ts directly, with no build step and no new
// dependency) requires an explicit extension on every relative specifier,
// the same requirement plain ESM has always had for .js.
//
// This hook closes exactly that one gap, for exactly the process that
// needs it, without touching a single src file or its extensionless import
// style: if Node's default resolution fails to find a relative specifier,
// retry once with ".ts" appended.
export async function resolve(specifier, context, nextResolve) {
  const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
  const hasExtension = /\.[cm]?[jt]sx?$/.test(specifier);

  if (!isRelative || hasExtension) {
    return nextResolve(specifier, context);
  }

  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (error?.code === "ERR_MODULE_NOT_FOUND") {
      return nextResolve(`${specifier}.ts`, context);
    }
    throw error;
  }
}

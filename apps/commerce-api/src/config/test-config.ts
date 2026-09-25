import type { AppConfig } from "./env.schema";

// A valid config object for tests, built directly rather than parsed from
// process.env (plan.md, Phase 6, §8: "tests build the config object
// directly and never read process.env"). Test-only: not exported from any
// module's public surface, imported straight from *.test.ts files.
export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return Object.freeze({
    NODE_ENV: "test",
    HOST: "127.0.0.1",
    PORT: 0,
    LOG_LEVEL: "error",
    LOG_FORMAT: "json",
    ...overrides,
  });
}

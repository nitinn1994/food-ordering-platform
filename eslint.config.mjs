import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/next-env.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Enforces docs/architecture/system-architecture.md §4.3: agent output is
    // untrusted input, never code. Supports AC6.
    rules: {
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
    },
  },
  {
    // Enforces system-architecture.md §4.4: a UI command must never be able
    // to reach commerce state, and apps/web renders UI commands only — it
    // never executes a business intent. dispatch.ts already makes this
    // structural for cartStore (it simply has no import of it); this rule
    // makes it structural for the whole package, not just one file, so a
    // future addition to apps/web cannot import agent-intents by accident.
    // See docs/features/phase-5-contract-foundation/requirements.md D11 and
    // ADR-0012.
    files: ["apps/web/**/*.ts", "apps/web/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@contracts/agent-intents",
              message:
                "apps/web must never import agent-intents — business intents " +
                "are executed by commerce-api, not rendered by the frontend " +
                "(system-architecture.md §4.4, ADR-0012).",
            },
          ],
        },
      ],
    },
  },
);

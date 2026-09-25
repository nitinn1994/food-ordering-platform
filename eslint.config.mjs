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
  {
    // The same boundary as above, the other direction: commerce-api
    // executes business intents; it never produces UI commands — that is
    // ai-service's job, rendered only by apps/web (system-architecture.md
    // §4.4, §6). Structural rather than asserted, mirroring D11
    // (docs/features/phase-6-commerce-api-foundation/plan.md, §14).
    files: ["apps/commerce-api/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@contracts/ui-commands",
              message:
                "apps/commerce-api must never import ui-commands — UI " +
                "commands are produced by ai-service and rendered only by " +
                "apps/web (system-architecture.md §4.4, §6).",
            },
          ],
          patterns: [
            {
              // apps/web has no package scope and no path alias, so the
              // only way to reach it from here is a relative import — and
              // a relative specifier never contains the literal substring
              // "apps/web": going up out of apps/commerce-api's own tree
              // lands directly in "web/" (the shared parent is "apps/",
              // which a relative path climbs past without naming), e.g.
              // "../../web/src/lib/money", never "../../apps/web/...".
              // "**/apps/web/**" matched nothing real — verified by adding
              // exactly that import and confirming the rule stayed silent
              // — which is the defect this pattern replaces.
              group: ["**/web/**"],
              message:
                "apps/commerce-api must never import from apps/web — the " +
                "commerce API has no dependency on the frontend.",
            },
          ],
        },
      ],
    },
  },
  {
    // Keeps the domain and application layers independent of the database
    // (docs/features/phase-10-database-persistence/plan.md §27, AC14): only
    // a module's infrastructure/ adapters may reach kysely, pg or
    // src/database/. Services depend on ports — including TransactionRunner,
    // which lives in src/common/persistence/, not src/database/.
    //
    // Flat config does not merge rule options: for the files matched here,
    // this block's no-restricted-imports *replaces* the one above. So the
    // two commerce-api bans above are repeated verbatim, and all four were
    // verified to still fail lint with a temporary violating import.
    files: [
      "apps/commerce-api/src/modules/*/domain/**/*.ts",
      "apps/commerce-api/src/modules/*/*.service.ts",
      "apps/commerce-api/src/modules/*/*.controller.ts",
      "apps/commerce-api/src/modules/*/*.mapper.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@contracts/ui-commands",
              message:
                "apps/commerce-api must never import ui-commands — UI " +
                "commands are produced by ai-service and rendered only by " +
                "apps/web (system-architecture.md §4.4, §6).",
            },
            {
              name: "kysely",
              message:
                "Domain, service, controller and mapper code must not depend " +
                "on the database — use a port; only infrastructure/ adapters " +
                "touch storage (Phase 10 plan.md §9).",
            },
            {
              name: "pg",
              message:
                "Domain, service, controller and mapper code must not depend " +
                "on the database driver — only infrastructure/ adapters touch " +
                "storage (Phase 10 plan.md §9).",
            },
          ],
          patterns: [
            {
              group: ["**/web/**"],
              message:
                "apps/commerce-api must never import from apps/web — the " +
                "commerce API has no dependency on the frontend.",
            },
            {
              group: ["kysely/*", "pg/*", "**/database/**"],
              message:
                "Domain, service, controller and mapper code must not depend " +
                "on src/database/ or a database package — use a port; only " +
                "infrastructure/ adapters touch storage (Phase 10 plan.md §9).",
            },
          ],
        },
      ],
    },
  },
);

// @vitest-environment node
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FOOTER_LINKS } from "./footerLinks";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "../../app");

// mcdelivery-parity AC11: no dead footer links. A route is a page.tsx under
// app/, directly or inside a route group such as (static).
function routeExists(href: string): boolean {
  const segment = href.replace(/^\//, "");
  return ["", "(static)", "(home)"].some((group) =>
    existsSync(join(appDir, group, segment, "page.tsx")),
  );
}

describe("FOOTER_LINKS", () => {
  it.each(FOOTER_LINKS.map((link) => [link.href]))("%s is a page in the app", (href) => {
    expect(routeExists(href)).toBe(true);
  });
});

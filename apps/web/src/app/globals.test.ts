// @vitest-environment node
// Plain filesystem reads, no DOM — the same convention as
// lib/commands/dispatch.test.ts.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// docs/features/mcdelivery-redesign/requirements.md AC-U1: the design tokens
// live in globals.css, and component CSS modules use them instead of
// hard-coding the brand colours.
const appDir = dirname(fileURLToPath(import.meta.url));
const srcDir = join(appDir, "..");
const globals = readFileSync(join(appDir, "globals.css"), "utf8");

function cssModules(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return cssModules(path);
    return entry.name.endsWith(".module.css") ? [path] : [];
  });
}

describe("design tokens", () => {
  it("makes the header 96px at the 1200px desktop breakpoint (mcdelivery-parity AC2)", () => {
    expect(globals).toMatch(/@media \(min-width: 1200px\)\s*{\s*:root\s*{\s*--header-height: 96px;/);
  });

  it.each([
    "--color-brand-red",
    "--color-brand-yellow",
    "--color-bg",
    "--color-text",
    "--color-muted",
    "--color-accent",
    "--radius-sm",
    "--radius-md",
    "--radius-pill",
    "--space-4",
    // mcdelivery-parity AC1
    "--color-brand-yellow-cta",
    "--color-brand-yellow-tint",
    "--color-ink",
    "--color-on-ink",
    "--radius-xs",
    "--shadow-modal",
    "--font-size-page",
    "--font-size-lg",
    "--header-height",
  ])("defines %s", (token) => {
    expect(globals).toMatch(new RegExp(`${token}:`));
  });

  it("is light-only (OQ7)", () => {
    expect(globals).toMatch(/color-scheme:\s*light;/);
  });

  it("keeps brand colour hex values out of component CSS modules", () => {
    const brandHex = /#(db0007|da0005|b00004|ffbc0b|f2ad00|fbb900|fcecc7|fbf6f0)\b/i;
    const offenders = cssModules(srcDir).filter((file) =>
      brandHex.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});

// review-report.md findings 1 and 10: the text / background pairs the
// components use meet WCAG AA for normal text (4.5:1).
function tokenValue(name: string): string {
  const match = globals.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, "i"));
  if (!match?.[1]) throw new Error(`token ${name} not found`);
  return match[1];
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

describe("design tokens — text contrast (AC-U8)", () => {
  it.each([
    ["--color-text", "--color-bg"],
    ["--color-text", "--color-brand-yellow"],
    ["--color-muted", "--color-surface"],
    ["--color-muted", "--color-bg"],
    ["--color-accent-strong", "--color-surface-warm"],
    ["--color-on-brand", "--color-brand-red"],
    ["--color-on-brand", "--color-accent-strong"],
    ["--color-danger", "--color-surface"],
    // mcdelivery-parity AC1, AC15
    ["--color-text", "--color-brand-yellow-cta"],
    ["--color-text", "--color-brand-yellow-tint"],
    ["--color-on-ink", "--color-ink"],
    ["--color-on-brand", "--color-ink"],
    ["--color-ink", "--color-brand-yellow-cta"],
  ])("%s on %s is at least 4.5:1", (text, background) => {
    expect(contrast(tokenValue(text), tokenValue(background))).toBeGreaterThanOrEqual(4.5);
  });

  it("does not put brand yellow text on brand red (finding 1)", () => {
    expect(contrast(tokenValue("--color-brand-yellow"), tokenValue("--color-brand-red"))).toBeLessThan(4.5);
    const hero = readFileSync(join(srcDir, "components/home/HeroBanner.module.css"), "utf8");
    expect(hero).not.toMatch(/color:\s*var\(--color-brand-yellow\)/);
  });
});

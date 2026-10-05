import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { SiteFooter } from "./SiteFooter";
import { FOOTER_LINKS } from "../../lib/content/footerLinks";

// mcdelivery-parity AC5 (desktop footer) and AC11 (no dead links).
describe("SiteFooter", () => {
  it("is the contentinfo landmark with one in-app link per footer entry", () => {
    render(<SiteFooter />);

    const footer = screen.getByRole("contentinfo");
    const links = within(within(footer).getByRole("navigation", { name: "Footer" })).getAllByRole(
      "link",
    );
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual(
      FOOTER_LINKS.map((link) => [link.label, link.href]),
    );
  });

  it("only links to in-app routes, never '#' or another site", () => {
    for (const link of FOOTER_LINKS) {
      expect(link.href).toMatch(/^\/[a-z-]+$/);
    }
  });
});

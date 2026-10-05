import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { MenuCategory } from "@contracts/api-contracts";
import { QuickPicks } from "./QuickPicks";
import { MENU } from "../../test/fixtures/menu";

const first = MENU[0]!;
const withDeal: MenuCategory[] = [
  { ...first, items: first.items.map((item, i) => (i === 0 ? { ...item, featured: ["deal"] } : item)) },
];

// mcdelivery-parity AC5: mobile Quick Picks.
describe("QuickPicks", () => {
  // Phase 3: tiles open /tag/[feature], like the desktop chips.
  it("links only the features the menu can satisfy to their /tag page", () => {
    render(<QuickPicks categories={withDeal} />);

    expect(screen.getByRole("heading", { name: "Quick Picks" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Deals" })).toHaveAttribute("href", "/tag/deal");
    expect(screen.queryByRole("link", { name: "New Launch" })).not.toBeInTheDocument();
  });

  it("renders nothing when no item is featured", () => {
    const { container } = render(<QuickPicks categories={MENU} />);

    expect(container).toBeEmptyDOMElement();
  });
});

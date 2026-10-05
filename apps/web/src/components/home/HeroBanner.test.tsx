import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HeroBanner } from "./HeroBanner";
import { BRAND_TAGLINE } from "../../lib/brand";

describe("HeroBanner", () => {
  it("is a labelled region with the tagline and decorative artwork", () => {
    const { container } = render(<HeroBanner />);

    const region = screen.getByRole("region", { name: "Featured" });
    expect(region).toHaveTextContent(BRAND_TAGLINE);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});

// mcdelivery-parity AC5: a thumbnail carousel, no autoplay.
describe("HeroBanner — carousel", () => {
  function thumbs() {
    return screen.getAllByRole("button", { name: /^Slide \d+:/ });
  }

  it("starts on the first slide with one thumbnail per slide", () => {
    render(<HeroBanner />);

    expect(thumbs()).toHaveLength(3);
    expect(thumbs()[0]).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("group", { name: "1 of 3" })).toHaveTextContent(
      "Your favourites, delivered.",
    );
  });

  it("shows the slide whose thumbnail is clicked", async () => {
    const user = userEvent.setup();
    render(<HeroBanner />);

    await user.click(thumbs()[1]!);

    expect(thumbs()[1]).toHaveAttribute("aria-pressed", "true");
    expect(thumbs()[0]).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("group", { name: "2 of 3" })).toHaveTextContent(
      "Breakfast, all morning.",
    );
  });

  it("moves between thumbnails with the arrow keys, wrapping, and keeps one tab stop", async () => {
    const user = userEvent.setup();
    render(<HeroBanner />);

    await user.tab();
    expect(thumbs()[0]).toHaveFocus();

    await user.keyboard("{ArrowLeft}");
    expect(thumbs()[2]).toHaveFocus();
    expect(thumbs()[2]).toHaveAttribute("aria-pressed", "true");

    await user.keyboard("{Home}");
    expect(thumbs()[0]).toHaveFocus();
    expect(thumbs().filter((t) => t.tabIndex === 0)).toHaveLength(1);
  });
});

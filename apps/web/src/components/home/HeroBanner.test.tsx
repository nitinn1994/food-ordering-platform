import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
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

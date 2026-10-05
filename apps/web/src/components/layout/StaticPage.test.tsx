import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { MENU } from "../../test/fixtures/menu";
import AboutPage from "../../app/(static)/about/page";
import PrivacyPolicyPage from "../../app/(static)/privacy-policy/page";
import TermsAndConditionsPage from "../../app/(static)/terms-and-conditions/page";
import FaqPage from "../../app/(static)/faq/page";
import SitemapPage from "../../app/(static)/sitemap/page";
import RestaurantsNearbyPage from "../../app/restaurants-nearby/page";
import ProfilePage from "../../app/profile/page";
import NotFound from "../../app/not-found";
import { FAQ_TOPICS } from "../../lib/content/staticPages";

vi.mock("../../lib/menu/menuSource", () => ({ getMenu: async () => MENU }));

// mcdelivery-parity AC11, AC15: each page renders one h1 in the shared
// template.
describe("static pages", () => {
  it.each<[string, () => ReactElement | Promise<ReactElement>]>([
    ["About Us", AboutPage],
    ["Privacy Policy", PrivacyPolicyPage],
    ["Terms & Conditions", TermsAndConditionsPage],
    ["FAQ", FaqPage],
    ["Site Map", SitemapPage],
    ["Restaurants Nearby", RestaurantsNearbyPage],
    ["My Account", ProfilePage],
    ["Page not found", NotFound],
  ])("%s has exactly one h1, its title", async (title, Page) => {
    render(await Page());

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings.map((heading) => heading.textContent)).toEqual([title]);
  });

  it("FAQ questions open in place, without JavaScript", () => {
    const { container } = render(<FaqPage />);

    const questions = container.querySelectorAll("details > summary");
    expect(questions).toHaveLength(FAQ_TOPICS.flatMap((topic) => topic.questions).length);
    for (const topic of FAQ_TOPICS) {
      expect(screen.getByRole("link", { name: topic.title })).toHaveAttribute("href", `#${topic.id}`);
    }
  });

  it("the site map links every category of the menu", async () => {
    render(await SitemapPage());

    for (const category of MENU) {
      expect(screen.getByRole("link", { name: category.name })).toHaveAttribute(
        "href",
        `/menu/${category.id}`,
      );
    }
  });
});

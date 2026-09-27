import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import GlobalError from "./global-error";

// Rendered to markup rather than into jsdom's document: the component
// supplies its own <html> and <body>.
describe("GlobalError (Phase 18)", () => {
  it("renders a whole document with static copy, a retry button, and never the error's message", () => {
    const markup = renderToStaticMarkup(
      <GlobalError error={new Error("SENTINEL upstream detail")} reset={() => {}} />,
    );

    expect(markup).toMatch(/^<html lang="en">/);
    expect(markup).toContain("<body>");
    expect(markup).toContain("Something went wrong. Please try again.");
    expect(markup).toContain('<button type="button">Try again</button>');
    expect(markup).not.toContain("SENTINEL");
  });
});

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { RouteCategoryProvider, useSelectedCategory } from "./routeCategory";
import { UiProvider, useUi } from "../state/uiStore";

function Probe() {
  const selected = useSelectedCategory();
  const { selectCategory } = useUi();
  return (
    <>
      <output>{selected ?? "all"}</output>
      <button type="button" onClick={() => selectCategory(null)}>
        All
      </button>
    </>
  );
}

// mcdelivery-parity Phase 3: /menu/[categoryId] opens on its category, and
// the selection then behaves as on the home page.
describe("RouteCategoryProvider", () => {
  it("answers with the route's category before the store has it — the server render", () => {
    const html = renderToString(
      <UiProvider>
        <RouteCategoryProvider categoryId="desserts">
          <Probe />
        </RouteCategoryProvider>
      </UiProvider>,
    );

    expect(html).toContain("desserts");
  });

  it("hands the category to the store, which then owns the selection", async () => {
    render(
      <UiProvider>
        <RouteCategoryProvider categoryId="desserts">
          <Probe />
        </RouteCategoryProvider>
      </UiProvider>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("desserts");
    await userEvent.setup().click(screen.getByRole("button", { name: "All" }));
    expect(screen.getByRole("status")).toHaveTextContent("all");
  });

  it("is plain uiStore selection outside a category route", () => {
    render(
      <UiProvider>
        <Probe />
      </UiProvider>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("all");
  });
});

// mcdelivery-parity review finding 1 (and its stale-frame companion).
describe("RouteCategoryProvider — leaving and switching routes", () => {
  function Shell({ route }: { route: string | null }) {
    return (
      <UiProvider>
        {route === null ? (
          <Probe />
        ) : (
          <RouteCategoryProvider categoryId={route}>
            <Probe />
          </RouteCategoryProvider>
        )}
      </UiProvider>
    );
  }

  it("hands the selection back when the category page is left, so home shows everything", () => {
    const { rerender } = render(<Shell route="desserts" />);
    expect(screen.getByRole("status")).toHaveTextContent("desserts");

    rerender(<Shell route={null} />);

    expect(screen.getByRole("status")).toHaveTextContent("all");
  });

  it("shows the new category from the first render after moving between category pages", () => {
    const seen: string[] = [];
    function Recorder() {
      seen.push(useSelectedCategory() ?? "all");
      return null;
    }
    const { rerender } = render(
      <UiProvider>
        <RouteCategoryProvider categoryId="desserts">
          <Recorder />
        </RouteCategoryProvider>
      </UiProvider>,
    );
    seen.length = 0;

    rerender(
      <UiProvider>
        <RouteCategoryProvider categoryId="mains">
          <Recorder />
        </RouteCategoryProvider>
      </UiProvider>,
    );

    expect(seen.length).toBeGreaterThan(0);
    expect(new Set(seen)).toEqual(new Set(["mains"]));
  });
});

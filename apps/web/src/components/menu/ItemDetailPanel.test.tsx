import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ItemDetailPanel } from "./ItemDetailPanel";
import { UiProvider, useUi } from "../../lib/state/uiStore";
import { MENU } from "../../lib/fixtures/menu";

function OpenDetailButton({ itemId }: { itemId: string }) {
  const { showItemDetail } = useUi();
  return (
    <button type="button" onClick={() => showItemDetail(itemId)}>
      Open {itemId}
    </button>
  );
}

function renderWithProvider() {
  return render(
    <UiProvider>
      <OpenDetailButton itemId="tiramisu" />
      <ItemDetailPanel categories={MENU} />
    </UiProvider>,
  );
}

describe("ItemDetailPanel — AC11", () => {
  it("renders nothing when no item is selected", () => {
    renderWithProvider();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("shows the enriched fields once an item is opened", async () => {
    renderWithProvider();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Open tiramisu" }));

    const panel = screen.getByRole("region", { name: "Tiramisu details" });
    expect(panel).toHaveTextContent(/espresso-soaked ladyfingers/i);
    expect(panel).toHaveTextContent("$7.50");
    expect(panel).toHaveTextContent("450 cal");
    expect(panel).toHaveTextContent("vegetarian");
    expect(panel).toHaveTextContent("gluten");
  });

  it("closes when the close button is activated", async () => {
    renderWithProvider();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Open tiramisu" }));
    expect(screen.getByRole("region")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close details" }));
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
});

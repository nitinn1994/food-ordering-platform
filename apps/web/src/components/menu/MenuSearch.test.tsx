import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MenuSearch } from "./MenuSearch";
import { UiProvider, useUi } from "../../lib/state/uiStore";

function TestHarness() {
  const { searchQuery } = useUi();
  return (
    <>
      <MenuSearch />
      <p data-testid="query-readout">{searchQuery}</p>
    </>
  );
}

function renderWithProvider() {
  return render(
    <UiProvider>
      <TestHarness />
    </UiProvider>,
  );
}

describe("MenuSearch — AC9", () => {
  it("has no clear button when the query is empty", () => {
    renderWithProvider();
    expect(
      screen.queryByRole("button", { name: "Clear search" }),
    ).not.toBeInTheDocument();
  });

  it("updates uiStore.searchQuery as the user types", async () => {
    renderWithProvider();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Search menu"), "tiramisu");

    expect(screen.getByTestId("query-readout")).toHaveTextContent("tiramisu");
  });

  it("shows a clear button once there is a query, and clears it on click", async () => {
    renderWithProvider();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Search menu"), "cake");
    const clearButton = screen.getByRole("button", { name: "Clear search" });

    await user.click(clearButton);

    expect(screen.getByTestId("query-readout")).toHaveTextContent("");
    expect(
      screen.queryByRole("button", { name: "Clear search" }),
    ).not.toBeInTheDocument();
  });
});

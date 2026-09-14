import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuantityStepper } from "./QuantityStepper";

describe("QuantityStepper", () => {
  it("names both controls after the item", () => {
    render(
      <QuantityStepper
        itemName="Tiramisu"
        quantity={2}
        maxQuantity={99}
        onIncrement={() => {}}
        onDecrement={() => {}}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Decrease quantity of Tiramisu" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Increase quantity of Tiramisu" }),
    ).toBeInTheDocument();
  });

  it("calls onIncrement when + is clicked", async () => {
    const onIncrement = vi.fn();
    const user = userEvent.setup();
    render(
      <QuantityStepper
        itemName="Tiramisu"
        quantity={2}
        maxQuantity={99}
        onIncrement={onIncrement}
        onDecrement={() => {}}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Increase quantity of Tiramisu" }),
    );

    expect(onIncrement).toHaveBeenCalledOnce();
  });

  it("calls onDecrement when − is clicked", async () => {
    const onDecrement = vi.fn();
    const user = userEvent.setup();
    render(
      <QuantityStepper
        itemName="Tiramisu"
        quantity={2}
        maxQuantity={99}
        onIncrement={() => {}}
        onDecrement={onDecrement}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Decrease quantity of Tiramisu" }),
    );

    expect(onDecrement).toHaveBeenCalledOnce();
  });

  it("disables decrease at quantity 1", () => {
    render(
      <QuantityStepper
        itemName="Tiramisu"
        quantity={1}
        maxQuantity={99}
        onIncrement={() => {}}
        onDecrement={() => {}}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Decrease quantity of Tiramisu" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Increase quantity of Tiramisu" }),
    ).toBeEnabled();
  });

  it("disables increase at the quantity cap", () => {
    render(
      <QuantityStepper
        itemName="Tiramisu"
        quantity={99}
        maxQuantity={99}
        onIncrement={() => {}}
        onDecrement={() => {}}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Increase quantity of Tiramisu" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Decrease quantity of Tiramisu" }),
    ).toBeEnabled();
  });

  it("tab order is decrease, then increase", async () => {
    const user = userEvent.setup();
    render(
      <QuantityStepper
        itemName="Tiramisu"
        quantity={2}
        maxQuantity={99}
        onIncrement={() => {}}
        onDecrement={() => {}}
      />,
    );

    await user.tab();
    expect(
      screen.getByRole("button", { name: "Decrease quantity of Tiramisu" }),
    ).toHaveFocus();

    await user.tab();
    expect(
      screen.getByRole("button", { name: "Increase quantity of Tiramisu" }),
    ).toHaveFocus();
  });
});

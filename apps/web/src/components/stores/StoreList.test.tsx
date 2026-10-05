import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { StoreList } from "./StoreList";
import { DEMO_STORES } from "../../lib/content/stores";

// mcdelivery-parity AC10.
describe("StoreList", () => {
  it("shows each store's name, open status, hours and distance", () => {
    render(<StoreList stores={DEMO_STORES} />);

    const cards = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(cards).toHaveLength(DEMO_STORES.length);
    const first = DEMO_STORES[0]!;
    expect(cards[0]).toHaveTextContent(first.name);
    expect(cards[0]).toHaveTextContent(first.open ? "Open" : "Closed");
    expect(cards[0]).toHaveTextContent(first.hours);
    expect(cards[0]).toHaveTextContent(first.distance);
  });

  it("shows the reference's empty state with no stores", () => {
    render(<StoreList stores={[]} />);

    expect(screen.getByRole("status")).toHaveTextContent("Sorry, we do not serve this location yet.");
  });

  it("never asks for the browser's location", () => {
    const getCurrentPosition = vi.fn();
    vi.stubGlobal("navigator", { ...navigator, geolocation: { getCurrentPosition, watchPosition: getCurrentPosition } });

    render(<StoreList stores={DEMO_STORES} />);

    expect(getCurrentPosition).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

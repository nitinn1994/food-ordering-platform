import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
// Named ErrorPage, not Error — importing the component as `Error` would
// shadow the global Error constructor for the rest of this file, breaking
// `new Error(...)` below in a confusing way (learned the hard way).
import ErrorPage from "./error";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

describe("Error — AC8, Phase 11 AC3", () => {
  it("renders a static, friendly message and does not crash", () => {
    render(<ErrorPage error={new Error("network down")} reset={() => {}} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "We couldn't load the menu right now. Please try again.",
    );
  });

  it("never renders the thrown error's message", () => {
    render(
      <ErrorPage
        error={new Error("Commerce API request failed (http 500 INTERNAL_ERROR)")}
        reset={() => {}}
      />,
    );
    expect(screen.queryByText(/Commerce API|INTERNAL_ERROR|500/)).toBeNull();
  });

  it("calls reset and refreshes the route when the retry button is activated", async () => {
    const reset = vi.fn();
    render(<ErrorPage error={new Error("boom")} reset={reset} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /try again/i }));

    expect(reset).toHaveBeenCalledOnce();
    // Re-runs the failed Server Component fetch, not just the boundary
    // (Phase 11 AC3 — reset() alone never re-fetched the menu).
    expect(refresh).toHaveBeenCalledOnce();
  });
});

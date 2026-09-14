import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
// Named ErrorPage, not Error — importing the component as `Error` would
// shadow the global Error constructor for the rest of this file, breaking
// `new Error(...)` below in a confusing way (learned the hard way).
import ErrorPage from "./error";

describe("Error — AC8", () => {
  it("renders the error message and does not crash", () => {
    render(<ErrorPage error={new Error("network down")} reset={() => {}} />);
    expect(screen.getByRole("alert")).toHaveTextContent("network down");
  });

  it("calls reset when the retry button is activated", async () => {
    const reset = vi.fn();
    render(<ErrorPage error={new Error("boom")} reset={reset} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /try again/i }));

    expect(reset).toHaveBeenCalledOnce();
  });
});

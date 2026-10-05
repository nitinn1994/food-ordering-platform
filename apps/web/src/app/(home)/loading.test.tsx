import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Loading from "./loading";

describe("Loading — AC7", () => {
  it("renders a status message while the menu is pending", () => {
    render(<Loading />);
    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
  });
});

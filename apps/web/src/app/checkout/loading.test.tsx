import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Loading from "./loading";

describe("Loading — checkout route", () => {
  it("renders a status message while checkout is pending", () => {
    render(<Loading />);
    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
  });
});

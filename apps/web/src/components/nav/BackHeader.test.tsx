import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BackHeader } from "./BackHeader";

const router = vi.hoisted(() => ({ back: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

afterEach(() => {
  router.back.mockReset();
  router.push.mockReset();
  vi.restoreAllMocks();
});

// mcdelivery-parity AC4: the mobile inner-page header.
describe("BackHeader", () => {
  it("goes back when this tab has history", async () => {
    vi.spyOn(window.history, "length", "get").mockReturnValue(3);
    render(<BackHeader />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Back" }));

    expect(router.back).toHaveBeenCalledOnce();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("goes home on a direct visit, rather than leaving the site", async () => {
    vi.spyOn(window.history, "length", "get").mockReturnValue(1);
    render(<BackHeader />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Back" }));

    expect(router.push).toHaveBeenCalledWith("/");
    expect(router.back).not.toHaveBeenCalled();
  });
});

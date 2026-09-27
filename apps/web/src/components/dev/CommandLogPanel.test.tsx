import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { UiProvider } from "../../lib/state/uiStore";
import { CommandLogPanel } from "./CommandLogPanel";

// Phase 18 (plan.md §3 S-4, OD4; requirements.md AC18).
describe("CommandLogPanel", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renders outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    render(
      <UiProvider>
        <CommandLogPanel />
      </UiProvider>,
    );

    expect(screen.getByRole("region", { name: "Command log (development)" })).toBeInTheDocument();
  });

  it("renders nothing in a production build", () => {
    vi.stubEnv("NODE_ENV", "production");
    const { container } = render(
      <UiProvider>
        <CommandLogPanel />
      </UiProvider>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});

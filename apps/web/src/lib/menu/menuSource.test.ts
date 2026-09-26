import { describe, expect, it, vi } from "vitest";
import { getMenu, findMenuItemIn } from "./menuSource";
import { MENU } from "../../test/fixtures/menu";
import { createFetchStub } from "../../test/fetchStub";
import { ApiError } from "../api/errors";

const BASE = "http://api.test";

function setup() {
  const stub = createFetchStub();
  const deps = { fetchImpl: stub.fetch, baseUrl: BASE, sleep: vi.fn(async () => undefined) };
  return { stub, deps };
}

describe("getMenu — reads commerce-api (Phase 11 AC1, AC3)", () => {
  it("GETs /v1/menu and resolves its categories", async () => {
    const { stub, deps } = setup();
    stub.reply({ body: { categories: MENU } });

    await expect(getMenu(deps)).resolves.toEqual(MENU);
    expect(stub.calls[0]).toMatchObject({ method: "GET", url: `${BASE}/v1/menu` });
  });

  it("never serves the menu from an HTTP cache, so routes render per request", async () => {
    const { stub, deps } = setup();
    stub.reply({ body: { categories: MENU } });

    await getMenu(deps);

    expect(stub.fetch).toHaveBeenCalledWith(
      `${BASE}/v1/menu`,
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("returns a genuine Promise rather than a synchronously-resolved value", () => {
    // What lets loading.tsx have something to show.
    const { stub, deps } = setup();
    stub.reply({ body: { categories: MENU } });
    expect(getMenu(deps)).toBeInstanceOf(Promise);
  });

  it("retries a transient failure before giving up", async () => {
    const { stub, deps } = setup();
    stub.reply({ networkError: true }, { body: { categories: MENU } });

    await expect(getMenu(deps)).resolves.toEqual(MENU);
    expect(stub.calls).toHaveLength(2);
  });

  it.each([
    ["the API is unreachable", [{ networkError: true }, { networkError: true }, { networkError: true }]],
    ["the API errors", [{ status: 500, body: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." } }]],
    ["the body does not match the contract", [{ body: { categories: [{ id: "x" }] } }]],
  ] as const)("rejects with an ApiError when %s", async (_case, replies) => {
    const { stub, deps } = setup();
    stub.reply(...replies);

    await expect(getMenu(deps)).rejects.toBeInstanceOf(ApiError);
  });
});

describe("findMenuItemIn", () => {
  it("finds an item across categories", () => {
    expect(findMenuItemIn(MENU, "tiramisu")?.name).toBe("Tiramisu");
  });

  it("returns undefined for an unknown itemId", () => {
    expect(findMenuItemIn(MENU, "does-not-exist")).toBeUndefined();
  });

  it("returns undefined when categories is empty", () => {
    expect(findMenuItemIn([], "tiramisu")).toBeUndefined();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ChatInput } from "./ChatInput";
import { useCart } from "../../lib/state/cartStore";
import { useUi } from "../../lib/state/uiStore";
import { EMPTY_CART, cartReply, errorReply, pricedCart, renderWithCart } from "../../test/cart";
import { deferred, jsonResponse, type StubReply } from "../../test/fetchStub";

// docs/features/phase-15-ai-ui-commands/requirements.md AC14–AC16.

const TURN_URL = "/api/ai/v1/agent/turns";
const CART_URL = "/api/commerce/v1/cart";
const META = {
  contractVersion: 1,
  correlationId: "turn_7f3a",
  issuedAt: "2026-09-26T12:00:00.000Z",
};
const SHOW_DESSERTS = { type: "ShowMenuCategory", categoryId: "desserts" };
const OPEN_CART = { type: "OpenCartPanel", open: true };

// Shows exactly the state a turn may change, so a test can assert on it.
function Probe() {
  const ui = useUi();
  const cart = useCart();
  return (
    <div>
      <p data-testid="category">{ui.selectedCategory ?? "none"}</p>
      <p data-testid="panel">{ui.cartPanelOpen ? "open" : "closed"}</p>
      <p data-testid="count">{cart.itemCount}</p>
      <ul data-testid="log">
        {[...ui.commandLog].reverse().map((entry, index) => (
          <li key={index}>
            {entry.status === "accepted" ? `accepted:${entry.command.type}` : "rejected"}
          </li>
        ))}
      </ul>
    </div>
  );
}

function turnReply(body: unknown): StubReply {
  return { body };
}

async function renderChat(replies: StubReply[]) {
  return renderWithCart(
    <>
      <ChatInput />
      <Probe />
    </>,
    { replies },
  );
}

async function send(user: Awaited<ReturnType<typeof renderChat>>["user"], text: string) {
  await user.type(screen.getByLabelText("Chat message"), text);
  await user.click(screen.getByRole("button", { name: "Send" }));
}

function logEntries(): string[] {
  return within(screen.getByTestId("log"))
    .queryAllByRole("listitem")
    .map((item) => item.textContent ?? "");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ChatInput — a turn", () => {
  it("sends the message to ai-service through the proxy and shows the reply", async () => {
    const { stub, user } = await renderChat([
      turnReply({ reply: "Here's that category." }),
      cartReply(EMPTY_CART),
    ]);

    await send(user, "show me the desserts");

    expect(await screen.findByText("Here's that category.")).toBeInTheDocument();
    expect(screen.getByText("show me the desserts")).toBeInTheDocument();
    expect(stub.calls[1]).toMatchObject({
      url: TURN_URL,
      method: "POST",
      body: { message: "show me the desserts" },
    });
  });

  it("renders the reply as text, never as markup", async () => {
    const { container, user } = await renderChat([
      turnReply({ reply: "<b>bold</b><img src=x onerror=alert(1)>" }),
      cartReply(EMPTY_CART),
    ]);

    await send(user, "Hello");

    expect(
      await screen.findByText("<b>bold</b><img src=x onerror=alert(1)>", { exact: false }),
    ).toBeInTheDocument();
    expect(container.querySelector("b")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("sends nothing for an empty or whitespace-only message", async () => {
    const { stub, user } = await renderChat([]);

    await user.type(screen.getByLabelText("Chat message"), "   ");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(stub.calls).toHaveLength(1); // only the initial cart GET
  });
});

describe("ChatInput — UI commands (AC14)", () => {
  it("applies accepted commands in order and logs each one", async () => {
    const { user } = await renderChat([
      turnReply({ reply: "Done.", uiCommands: { ...META, commands: [SHOW_DESSERTS, OPEN_CART] } }),
      cartReply(EMPTY_CART),
    ]);

    await send(user, "desserts and cart");

    await waitFor(() => expect(screen.getByTestId("panel")).toHaveTextContent("open"));
    expect(screen.getByTestId("category")).toHaveTextContent("desserts");
    expect(logEntries()).toEqual(["accepted:ShowMenuCategory", "accepted:OpenCartPanel"]);
  });

  it("drops a malformed command alone and still applies its siblings", async () => {
    const { user } = await renderChat([
      turnReply({
        reply: "Done.",
        uiCommands: {
          ...META,
          commands: [
            SHOW_DESSERTS,
            { type: "OpenCartPanel", open: true, execute: "alert(1)" },
            { type: "DeleteAllOrders" },
          ],
        },
      }),
      cartReply(EMPTY_CART),
    ]);

    await send(user, "desserts");

    await waitFor(() =>
      expect(logEntries()).toEqual(["accepted:ShowMenuCategory", "rejected", "rejected"]),
    );
    expect(screen.getByTestId("category")).toHaveTextContent("desserts");
    expect(screen.getByTestId("panel")).toHaveTextContent("closed");
  });

  it("applies nothing when the batch envelope is invalid, but still shows the reply", async () => {
    const { user } = await renderChat([
      turnReply({
        reply: "Here.",
        uiCommands: { ...META, contractVersion: 2, commands: [OPEN_CART] },
      }),
      cartReply(EMPTY_CART),
    ]);

    await send(user, "cart");

    expect(await screen.findByText("Here.")).toBeInTheDocument();
    expect(logEntries()).toEqual(["rejected"]);
    expect(screen.getByTestId("panel")).toHaveTextContent("closed");
  });
});

describe("ChatInput — the cart is re-read after every turn (AC15)", () => {
  it("refreshes after a successful turn and shows commerce-api's cart", async () => {
    const { stub, user } = await renderChat([
      turnReply({ reply: "Added it to your cart.", uiCommands: { ...META, commands: [OPEN_CART] } }),
      cartReply(pricedCart([{ itemId: "tiramisu", quantity: 1 }])),
    ]);

    await send(user, "add tiramisu");

    await waitFor(() => expect(screen.getByTestId("count")).toHaveTextContent("1"));
    expect(stub.calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      `GET ${CART_URL}`,
      `POST ${TURN_URL}`,
      `GET ${CART_URL}`,
    ]);
  });

  it("finishes the refresh before any command is applied", async () => {
    const held = deferred<Response>();
    const { user } = await renderChat([
      turnReply({ reply: "Added it to your cart.", uiCommands: { ...META, commands: [OPEN_CART] } }),
      () => held.promise,
    ]);

    await send(user, "add tiramisu");

    // The turn has answered, but the cart GET is still in flight: no reply
    // and no command yet.
    await waitFor(() => expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled());
    expect(screen.queryByText("Added it to your cart.")).toBeNull();
    expect(screen.getByTestId("panel")).toHaveTextContent("closed");

    held.resolve(jsonResponse(pricedCart([{ itemId: "tiramisu", quantity: 1 }])));

    await waitFor(() => expect(screen.getByTestId("panel")).toHaveTextContent("open"));
    expect(screen.getByTestId("count")).toHaveTextContent("1");
    expect(screen.getByText("Added it to your cart.")).toBeInTheDocument();
  });

  it.each<[string, StubReply]>([
    ["AGENT_FAILED", errorReply(500, "AGENT_FAILED")],
    ["a network failure", { networkError: true }],
  ])("refreshes after %s too — the turn may have changed the cart", async (_label, failure) => {
    const { stub, user } = await renderChat([failure, cartReply(EMPTY_CART)]);

    await send(user, "add tiramisu");

    await waitFor(() => expect(stub.calls).toHaveLength(3));
    expect(stub.calls[2]).toMatchObject({ url: CART_URL, method: "GET" });
  });
});

describe("ChatInput — one turn at a time, fixed failure copy (AC16)", () => {
  it("disables Send while a turn is in flight and sends one request for a double submit", async () => {
    const held = deferred<Response>();
    const { stub, user } = await renderChat([() => held.promise, cartReply(EMPTY_CART)]);

    await user.type(screen.getByLabelText("Chat message"), "Hello");
    const form = screen.getByRole("button", { name: "Send" }).closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form as HTMLFormElement);
    fireEvent.submit(form as HTMLFormElement);

    expect(await screen.findByRole("button", { name: "Sending…" })).toBeDisabled();
    expect(screen.getByLabelText("Chat message")).toBeDisabled();
    expect(stub.calls.filter((call) => call.url === TURN_URL)).toHaveLength(1);

    held.resolve(jsonResponse({ reply: "Hi" }));

    expect(await screen.findByRole("button", { name: "Send" })).toBeEnabled();
  });

  it("shows fixed copy for AGENT_FAILED, never the backend's message", async () => {
    const { user } = await renderChat([
      errorReply(500, "AGENT_FAILED", "Backend detail that must never render."),
      cartReply(EMPTY_CART),
    ]);

    await send(user, "Hello");

    expect(
      await screen.findByText("Something went wrong on our side. Please try again."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Backend detail/)).toBeNull();
    expect(logEntries()).toEqual([]);
  });

  it("shows the unreachable copy when ai-service cannot be reached", async () => {
    const { user } = await renderChat([{ networkError: true }, cartReply(EMPTY_CART)]);

    await send(user, "Hello");

    expect(await screen.findByText(/We can't reach the restaurant right now/)).toBeInTheDocument();
  });

  it("bounds the input to the contract's message length", async () => {
    await renderChat([]);

    expect(screen.getByLabelText("Chat message")).toHaveAttribute("maxLength", "2000");
  });
});

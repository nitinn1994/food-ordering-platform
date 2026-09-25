import { describe, expect, it } from "vitest";
import type { MenuItemId } from "@contracts/common";
import { orderResponseSchema } from "@contracts/api-contracts";
import { CartCatalog } from "../cart/domain/cart-catalog";
import { CartOwnerResolver } from "../cart/domain/cart-owner.resolver";
import type { CartOwnerId, CatalogItem } from "../cart/domain/cart.types";
import { InMemoryCartRepository } from "../cart/infrastructure/in-memory-cart.repository";
import { CartService } from "../cart/cart.service";
import { CheckoutCart } from "./domain/checkout-cart";
import { OrderIdGenerator } from "./domain/order-id.generator";
import { OrderOwnerResolver } from "./domain/order-owner.resolver";
import {
  CartEmptyError,
  CheckoutCartConflictError,
  IdempotencyKeyReusedError,
  OrderItemUnavailableError,
  OrderNotFoundError,
} from "./domain/order.errors";
import { OrderInvariantViolationError } from "./domain/order.invariants";
import type {
  CheckoutLine,
  CheckoutSnapshot,
  CustomerDetails,
  Order,
  OrderOwnerId,
} from "./domain/order.types";
import { CartCheckoutAdapter } from "./infrastructure/cart-checkout.adapter";
import { InMemoryOrderRepository } from "./infrastructure/in-memory-order.repository";
import { OrderService } from "./order.service";

// Fakes for the cart, owner and id ports — OrderService is constructed with
// nothing concrete except the in-memory order repository, whose uniqueness
// contract is part of what is under test (requirements.md AC11). The
// concurrency tests at the end swap the fake cart for the real CartService
// behind the real adapter, because the guarantee they prove is the cart
// version's.

const CUSTOMER: CustomerDetails = {
  fullName: "Ada Lovelace",
  phone: "+44 20 7946 0958",
  email: "ada@example.com",
};

const TIRAMISU: CheckoutLine = {
  itemId: "tiramisu",
  name: "Tiramisu",
  unitPriceCents: 750,
  quantity: 2,
  lineSubtotalCents: 1500,
  available: true,
};

const GARLIC_BREAD: CheckoutLine = {
  itemId: "garlic-bread",
  name: "Garlic Bread",
  unitPriceCents: 595,
  quantity: 1,
  lineSubtotalCents: 595,
  available: true,
};

class FakeOwnerResolver extends OrderOwnerResolver {
  constructor(public ownerId: OrderOwnerId = "owner-a") {
    super();
  }

  async resolve(): Promise<OrderOwnerId> {
    return this.ownerId;
  }
}

// A cart that behaves like the real one where it matters: consume() checks
// the version and bumps it.
class FakeCheckoutCart extends CheckoutCart {
  lines: CheckoutLine[] = [TIRAMISU, GARLIC_BREAD];
  version = 2;
  unpricedLineCount = 0;
  loads = 0;
  consumed: number[] = [];

  constructor(private readonly owner: FakeOwnerResolver) {
    super();
  }

  async load(): Promise<CheckoutSnapshot> {
    this.loads += 1;
    return {
      ownerId: this.owner.ownerId,
      version: this.version,
      lines: this.lines.map((line) => ({ ...line })),
      unpricedLineCount: this.unpricedLineCount,
    };
  }

  async consume(expectedVersion: number): Promise<void> {
    if (expectedVersion !== this.version) {
      throw new CheckoutCartConflictError();
    }
    this.consumed.push(expectedVersion);
    this.lines = [];
    this.version += 1;
  }
}

class SequentialOrderIds extends OrderIdGenerator {
  private count = 0;

  next(): string {
    this.count += 1;
    return `00000000-0000-4000-8000-${String(this.count).padStart(12, "0")}`;
  }
}

class CountingOrderRepository extends InMemoryOrderRepository {
  creates = 0;

  override async create(order: Order): Promise<void> {
    this.creates += 1;
    return super.create(order);
  }
}

function setup() {
  const repository = new CountingOrderRepository();
  const owner = new FakeOwnerResolver();
  const cart = new FakeCheckoutCart(owner);
  const service = new OrderService(
    repository,
    cart,
    owner,
    new SequentialOrderIds(),
  );
  return { service, repository, cart, owner };
}

describe("OrderService", () => {
  describe("placeOrder (AC1, AC2)", () => {
    it("snapshots the cart into an order, consumes the cart, and stores the order", async () => {
      const { service, repository, cart } = setup();

      const order = await service.placeOrder("key-1", CUSTOMER);

      expect(orderResponseSchema.safeParse(order).success).toBe(true);
      expect(order).toEqual({
        orderId: "00000000-0000-4000-8000-000000000001",
        status: "placed",
        placedAt: expect.any(String),
        customer: CUSTOMER,
        items: [
          {
            itemId: "tiramisu",
            name: "Tiramisu",
            unitPriceCents: 750,
            quantity: 2,
            lineSubtotalCents: 1500,
          },
          {
            itemId: "garlic-bread",
            name: "Garlic Bread",
            unitPriceCents: 595,
            quantity: 1,
            lineSubtotalCents: 595,
          },
        ],
        itemCount: 3,
        subtotalCents: 2095,
        totalCents: 2095,
      });
      expect(cart.consumed).toEqual([2]);
      expect(cart.lines).toEqual([]);
      await expect(service.getOrder(order.orderId)).resolves.toEqual(order);
      expect(repository.creates).toBe(1);
    });

    it("omits email from the response when the customer gave none", async () => {
      const { service } = setup();

      const order = await service.placeOrder("key-1", {
        fullName: "Ada Lovelace",
        phone: "5551234",
      });

      expect(order.customer).toEqual({ fullName: "Ada Lovelace", phone: "5551234" });
      expect(Object.keys(order.customer)).not.toContain("email");
    });
  });

  describe("idempotency (AC4, AC5)", () => {
    it("replays the original order for the same key and customer, without touching the cart", async () => {
      const { service, repository, cart } = setup();
      const first = await service.placeOrder("key-1", CUSTOMER);
      cart.lines = [TIRAMISU];

      const replay = await service.placeOrder("key-1", { ...CUSTOMER });

      expect(replay).toEqual(first);
      expect(repository.creates).toBe(1);
      expect(cart.loads).toBe(1);
      expect(cart.consumed).toEqual([2]);
      expect(cart.lines).toEqual([TIRAMISU]);
    });

    it("refuses the same key with a different customer and changes nothing", async () => {
      const { service, repository, cart } = setup();
      await service.placeOrder("key-1", CUSTOMER);
      cart.lines = [TIRAMISU];

      await expect(
        service.placeOrder("key-1", { ...CUSTOMER, fullName: "Grace Hopper" }),
      ).rejects.toBeInstanceOf(IdempotencyKeyReusedError);
      expect(repository.creates).toBe(1);
      expect(cart.loads).toBe(1);
      expect(cart.lines).toEqual([TIRAMISU]);
    });

    it("treats a new key as a new request — refused once the cart is consumed", async () => {
      const { service, repository } = setup();
      await service.placeOrder("key-1", CUSTOMER);

      await expect(service.placeOrder("key-2", CUSTOMER)).rejects.toBeInstanceOf(
        CartEmptyError,
      );
      expect(repository.creates).toBe(1);
    });

    it("scopes keys by owner", async () => {
      const { service, repository, cart, owner } = setup();
      const first = await service.placeOrder("key-1", CUSTOMER);

      owner.ownerId = "owner-b";
      cart.lines = [TIRAMISU];
      const second = await service.placeOrder("key-1", CUSTOMER);

      expect(second.orderId).not.toBe(first.orderId);
      expect(repository.creates).toBe(2);
    });
  });

  describe("refusals (AC6, AC7, AC8) — nothing consumed, nothing stored", () => {
    it("refuses an empty cart", async () => {
      const { service, repository, cart } = setup();
      cart.lines = [];

      await expect(service.placeOrder("key-1", CUSTOMER)).rejects.toBeInstanceOf(
        CartEmptyError,
      );
      expect(cart.consumed).toEqual([]);
      expect(repository.creates).toBe(0);
    });

    it("refuses a cart with an unavailable line and keeps the cart", async () => {
      const { service, repository, cart } = setup();
      cart.lines = [TIRAMISU, { ...GARLIC_BREAD, available: false }];

      await expect(service.placeOrder("key-1", CUSTOMER)).rejects.toBeInstanceOf(
        OrderItemUnavailableError,
      );
      expect(cart.consumed).toEqual([]);
      expect(cart.lines).toHaveLength(2);
      expect(repository.creates).toBe(0);
    });

    it("refuses a cart with a line no longer on the menu", async () => {
      const { service, repository, cart } = setup();
      cart.unpricedLineCount = 1;

      await expect(service.placeOrder("key-1", CUSTOMER)).rejects.toBeInstanceOf(
        OrderItemUnavailableError,
      );
      expect(cart.consumed).toEqual([]);
      expect(repository.creates).toBe(0);
    });

    it("refuses when the cart changed between pricing and consumption", async () => {
      const { service, repository, cart } = setup();
      const load = cart.load.bind(cart);
      cart.load = async () => {
        const snapshot = await load();
        cart.version += 1; // another write lands after the snapshot
        return snapshot;
      };

      await expect(service.placeOrder("key-1", CUSTOMER)).rejects.toBeInstanceOf(
        CheckoutCartConflictError,
      );
      expect(repository.creates).toBe(0);
      expect(cart.lines).toHaveLength(2);
    });

    it("refuses a checkout cart that belongs to a different owner (wiring bug → 500)", async () => {
      const { service, repository, cart } = setup();
      const load = cart.load.bind(cart);
      cart.load = async () => ({ ...(await load()), ownerId: "owner-b" });

      await expect(service.placeOrder("key-1", CUSTOMER)).rejects.toBeInstanceOf(
        OrderInvariantViolationError,
      );
      expect(cart.consumed).toEqual([]);
      expect(repository.creates).toBe(0);
    });
  });

  // AC9: an order is a snapshot. What happens to the menu or the cart later
  // never reaches it.
  describe("snapshots are historical", () => {
    it("keeps the placement-time name and price after the menu changes", async () => {
      const { service, cart } = setup();
      const placed = await service.placeOrder("key-1", CUSTOMER);

      cart.lines = [{ ...TIRAMISU, name: "Tiramisu Deluxe", unitPriceCents: 900, lineSubtotalCents: 1800 }];

      const read = await service.getOrder(placed.orderId);
      expect(read.items[0]).toMatchObject({ name: "Tiramisu", unitPriceCents: 750 });
      expect(read.totalCents).toBe(2095);
    });
  });

  // The documented cost of OD11: a failed order write after the cart was
  // consumed surfaces as an error (a logged 500), and the cart stays
  // consumed. Reachable only through a programming error in memory.
  describe("order write failure after consumption", () => {
    it("propagates the error and leaves the cart consumed", async () => {
      const { service, repository, cart } = setup();
      const failure = new Error("storage down");
      repository.create = async () => {
        throw failure;
      };

      await expect(service.placeOrder("key-1", CUSTOMER)).rejects.toBe(failure);
      expect(cart.consumed).toEqual([2]);
    });
  });

  describe("getOrder (AC3)", () => {
    it("throws OrderNotFoundError for an unknown id", async () => {
      const { service } = setup();
      await expect(
        service.getOrder("00000000-0000-4000-8000-999999999999"),
      ).rejects.toBeInstanceOf(OrderNotFoundError);
    });

    it("does not return another owner's order", async () => {
      const { service, owner } = setup();
      const placed = await service.placeOrder("key-1", CUSTOMER);

      owner.ownerId = "owner-b";

      await expect(service.getOrder(placed.orderId)).rejects.toBeInstanceOf(
        OrderNotFoundError,
      );
    });
  });

  // AC8: concurrent placements against the real CartService. Deterministic
  // interleaving, no timers — both requests load the cart before either
  // consumes it. The cart version decides: exactly one order.
  describe("concurrent placements (AC8, OD11)", () => {
    class FakeCatalog extends CartCatalog {
      async findItem(itemId: MenuItemId): Promise<CatalogItem | undefined> {
        return itemId === "tiramisu"
          ? { id: "tiramisu", name: "Tiramisu", priceCents: 750, available: true }
          : undefined;
      }
    }

    class FixedCartOwner extends CartOwnerResolver {
      async resolve(): Promise<CartOwnerId> {
        return "owner-a";
      }
    }

    class GatedCheckoutCart extends CartCheckoutAdapter {
      release!: () => void;
      private readonly gate = new Promise<void>((resolve) => {
        this.release = resolve;
      });

      override async load(): Promise<CheckoutSnapshot> {
        const snapshot = await super.load();
        await this.gate;
        return snapshot;
      }
    }

    async function concurrentSetup() {
      const cartService = new CartService(
        new InMemoryCartRepository(),
        new FakeCatalog(),
        new FixedCartOwner(),
      );
      await cartService.addItem("tiramisu", 2);
      const checkout = new GatedCheckoutCart(cartService);
      const repository = new CountingOrderRepository();
      const service = new OrderService(
        repository,
        checkout,
        new FakeOwnerResolver("owner-a"),
        new SequentialOrderIds(),
      );
      return { cartService, checkout, repository, service };
    }

    it.each([
      ["different keys", "key-1", "key-2"],
      ["the same key", "key-1", "key-1"],
    ])(
      "yields exactly one order for two placements with %s",
      async (_label, firstKey, secondKey) => {
        const { cartService, checkout, repository, service } =
          await concurrentSetup();

        const first = service.placeOrder(firstKey, CUSTOMER);
        const second = service.placeOrder(secondKey, CUSTOMER);
        checkout.release();
        const results = await Promise.allSettled([first, second]);

        const rejected = results.filter((result) => result.status === "rejected");
        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
          CheckoutCartConflictError,
        );
        expect(repository.creates).toBe(1);
        expect((await cartService.getCart()).items).toEqual([]);
      },
    );

    // The other interleaving: one placement loads the cart, then waits while
    // another completes entirely (consumed, order stored). Only the explicit
    // version check in completeCheckout can catch this one — the cart
    // repository's own save check would accept a clear on the fresh cart.
    it("refuses a placement whose cart was consumed by a completed placement after it loaded", async () => {
      const cartService = new CartService(
        new InMemoryCartRepository(),
        new FakeCatalog(),
        new FixedCartOwner(),
      );
      await cartService.addItem("tiramisu", 2);
      const gated = new GatedCheckoutCart(cartService);
      const ungated = new CartCheckoutAdapter(cartService);
      const repository = new CountingOrderRepository();
      const owner = new FakeOwnerResolver("owner-a");
      const ids = new SequentialOrderIds();
      const slow = new OrderService(repository, gated, owner, ids);
      const fast = new OrderService(repository, ungated, owner, ids);

      const late = slow.placeOrder("key-1", CUSTOMER);
      await fast.placeOrder("key-2", CUSTOMER);
      gated.release();

      await expect(late).rejects.toBeInstanceOf(CheckoutCartConflictError);
      expect(repository.creates).toBe(1);
    });

    it("lets the losing same-key request replay the winner's order on retry", async () => {
      const { checkout, repository, service } = await concurrentSetup();

      const first = service.placeOrder("key-1", CUSTOMER);
      const second = service.placeOrder("key-1", CUSTOMER);
      checkout.release();
      const [winner] = await Promise.allSettled([first, second]);

      const retry = await service.placeOrder("key-1", CUSTOMER);
      expect(retry).toEqual((winner as PromiseFulfilledResult<unknown>).value);
      expect(repository.creates).toBe(1);
    });
  });
});

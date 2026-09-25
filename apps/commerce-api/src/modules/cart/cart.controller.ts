import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import {
  addCartItemRequestSchema,
  cartItemParamsSchema,
  updateCartItemRequestSchema,
  type AddCartItemRequest,
  type CartItemParams,
  type CartResponse,
  type UpdateCartItemRequest,
} from "@contracts/api-contracts";
import { CartService } from "./cart.service";

// Served under /v1/cart via the default URI version, like MenuController.
// Singular "cart": the caller's own cart, resolved server-side — no cart id
// appears in any route, and nothing here reads one from the request
// (docs/features/phase-8-cart-domain/plan.md §5, §7; requirements.md AC10).
//
// No branching, no owner resolution, no error decisions (requirements.md
// AC12): every path and body is validated by the global
// StandardSchemaValidationPipe against @contracts/api-contracts schemas
// before the handler runs, and each handler makes exactly one CartService
// call. Every route returns the whole cart with 200 (plan.md OD9).
//
// Deliberately no DELETE /v1/cart: clearing is the internal mechanism of a
// placed order, not a user-facing feature (plan.md OD5; ADR-0011).
@Controller("cart")
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  async getCart(): Promise<CartResponse> {
    return this.cartService.getCart();
  }

  // 200, not Nest's POST default of 201: an add may merge into an existing
  // line rather than create anything, and the resource returned is the cart.
  @Post("items")
  @HttpCode(HttpStatus.OK)
  async addItem(
    @Body({ schema: addCartItemRequestSchema }) body: AddCartItemRequest,
  ): Promise<CartResponse> {
    return this.cartService.addItem(body.itemId, body.quantity);
  }

  @Patch("items/:itemId")
  async setItemQuantity(
    @Param({ schema: cartItemParamsSchema }) params: CartItemParams,
    @Body({ schema: updateCartItemRequestSchema }) body: UpdateCartItemRequest,
  ): Promise<CartResponse> {
    return this.cartService.setItemQuantity(params.itemId, body.quantity);
  }

  @Delete("items/:itemId")
  async removeItem(
    @Param({ schema: cartItemParamsSchema }) params: CartItemParams,
  ): Promise<CartResponse> {
    return this.cartService.removeItem(params.itemId);
  }
}

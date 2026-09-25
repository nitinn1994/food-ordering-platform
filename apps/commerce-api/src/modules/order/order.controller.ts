import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from "@nestjs/common";
import {
  createOrderRequestSchema,
  orderParamsSchema,
  type CreateOrderRequest,
  type OrderParams,
  type OrderResponse,
} from "@contracts/api-contracts";
import { OrderService } from "./order.service";

// Served under /v1/orders via the default URI version, like the Menu and
// Cart controllers. Plural: orders are resources with ids, unlike the
// singular "my cart" (docs/features/phase-9-order-domain/plan.md §13).
//
// No branching, no owner resolution, no error decisions (requirements.md
// AC11): every path and body is validated by the global
// StandardSchemaValidationPipe against @contracts/api-contracts schemas
// before the handler runs, and each handler makes exactly one OrderService
// call.
//
// Deliberately no GET /v1/orders: order history is out of scope (plan.md
// OD2).
@Controller("orders")
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  // 201 for a new order and for a replay alike: a replay returns the
  // original response unchanged, so the controller never branches on which
  // one happened (plan.md §12, OD8).
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async placeOrder(
    @Body({ schema: createOrderRequestSchema }) body: CreateOrderRequest,
  ): Promise<OrderResponse> {
    return this.orderService.placeOrder(body.idempotencyKey, body.customer);
  }

  @Get(":orderId")
  async getOrder(
    @Param({ schema: orderParamsSchema }) params: OrderParams,
  ): Promise<OrderResponse> {
    return this.orderService.getOrder(params.orderId);
  }
}

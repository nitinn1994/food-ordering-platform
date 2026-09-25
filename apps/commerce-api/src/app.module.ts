import { type DynamicModule, Module } from "@nestjs/common";
import { ConfigModule } from "./config/config.module";
import type { AppConfig } from "./config/env.schema";
import { DatabaseModule } from "./database/database.module";
import { HealthModule } from "./health/health.module";
import { CartModule } from "./modules/cart/cart.module";
import { MenuModule } from "./modules/menu/menu.module";
import { OrderModule } from "./modules/order/order.module";

// Dynamic (`forRoot(config)`) rather than a plain `@Module`, because the
// validated config comes from main.ts's own parseEnv() call, not from this
// module reading process.env itself (config.module.ts).
//
// Cross-cutting HTTP middleware (request context, content-type guard, body
// parsing, request logging, validation, error handling, versioning) is
// deliberately NOT wired here through NestModule.configure() — it lives in
// configure-app.ts instead, applied to the app instance directly by both
// main.ts and every API test. See configure-app.ts's own comment for why
// that split is load-bearing, not stylistic (a real ordering bug was found
// and fixed in sub-phase 6.3 because of it).
//
// MenuModule (Phase 7) is the first domain module — read-only, one per
// phase, no umbrella "Commerce" module (ADR-0013 §8). CartModule (Phase 8)
// is the second, and imports MenuModule itself for item validation and
// pricing. OrderModule (Phase 9) is the third, and imports CartModule
// itself to price and consume the cart an order is placed from.
//
// DatabaseModule (Phase 10) is global, like ConfigModule: the connection
// every module's infrastructure/ adapters share, built from the same
// validated config (docs/features/phase-10-database-persistence/plan.md
// §15).
@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(config),
        DatabaseModule.forRoot(config),
        HealthModule,
        MenuModule,
        CartModule,
        OrderModule,
      ],
    };
  }
}

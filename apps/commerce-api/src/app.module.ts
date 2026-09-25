import { type DynamicModule, Module } from "@nestjs/common";
import { ConfigModule } from "./config/config.module";
import type { AppConfig } from "./config/env.schema";
import { HealthModule } from "./health/health.module";
import { CartModule } from "./modules/cart/cart.module";
import { MenuModule } from "./modules/menu/menu.module";

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
// pricing. Order still does not exist.
@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(config),
        HealthModule,
        MenuModule,
        CartModule,
      ],
    };
  }
}

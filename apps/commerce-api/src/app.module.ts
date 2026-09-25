import { type DynamicModule, Module } from "@nestjs/common";
import { ConfigModule } from "./config/config.module";
import type { AppConfig } from "./config/env.schema";
import { HealthModule } from "./health/health.module";

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
// No Menu, Cart, or Order module exists yet (requirements.md AC13) —
// HealthModule is the only domain-adjacent module so far.
@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [ConfigModule.forRoot(config), HealthModule],
    };
  }
}

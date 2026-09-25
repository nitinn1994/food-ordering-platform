import { type DynamicModule, Global, Module } from "@nestjs/common";
import type { AppConfig } from "../config/env.schema";
import { DatabaseClient, createDatabase } from "./database-client";

// The database connection, available to every module's infrastructure/
// adapters without re-importing this module — @Global for the same reason
// ConfigModule is (docs/features/phase-10-database-persistence/plan.md §15).
// Registered with the config main.ts already parsed; this module never
// reads process.env.
//
// DatabaseClient's own lifecycle hooks check connectivity at boot and drain
// the pool on shutdown (configure-app.ts already enables shutdown hooks).
// Tests that must not touch a database replace DatabaseClient entirely
// (test/support/in-memory-persistence.ts).
@Global()
@Module({})
export class DatabaseModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [
        {
          provide: DatabaseClient,
          useFactory: () => new DatabaseClient(createDatabase(config)),
        },
      ],
      exports: [DatabaseClient],
    };
  }
}

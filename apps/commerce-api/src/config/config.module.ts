import { type DynamicModule, Global, Module } from "@nestjs/common";
import type { AppConfig } from "./env.schema";

export const APP_CONFIG = Symbol("APP_CONFIG");

// @Global so every future module can inject APP_CONFIG without re-importing
// this module — the same reasoning packages/contracts/common's shared
// primitives use for not being duplicated per consumer (ADR-0012), applied
// here to a process-wide config object instead of a contract primitive.
//
// Registered with a config object main.ts has already parsed and validated
// (env.schema.ts's parseEnv) — this module never reads process.env itself.
// That keeps env-reading in exactly one place, and lets a test provide any
// config it likes via ConfigModule.forRoot(testConfig()) without touching
// process.env (plan.md, Phase 6, §8).
@Global()
@Module({})
export class ConfigModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: APP_CONFIG, useValue: config }],
      exports: [APP_CONFIG],
    };
  }
}

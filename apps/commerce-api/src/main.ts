// Must be the first import: Nest's dependency injection reads decorator
// metadata that only exists once this side-effecting import has run, and
// every decorated class below (AppModule, HealthController, HealthService)
// is loaded after it because ES module imports execute top-to-bottom in the
// order they appear in this, the entry module.
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { configureApp } from "./configure-app";
import { AppLogger, logLevelsFrom } from "./common/logging/logger";
import {
  type AppConfig,
  EnvValidationError,
  parseEnv,
} from "./config/env.schema";

// Parsed before the Nest application is created (requirements.md AC4): an
// invalid environment must stop the process before it starts listening, not
// surface as a runtime error on whichever request first needs it. The
// message names the failing fields only — see env.schema.ts's
// EnvValidationError — and is printed with plain console.error because no
// logger exists yet at this point in bootstrap.
function loadConfig(): AppConfig {
  try {
    return parseEnv();
  } catch (error) {
    if (error instanceof EnvValidationError) {
      // No logger exists yet at this point in bootstrap — Nest hasn't been
      // created, so this is the one place in the service that logs via
      // plain console.error rather than AppLogger.
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

async function bootstrap(): Promise<void> {
  const config = loadConfig();

  const logger = new AppLogger({
    json: config.LOG_FORMAT === "json",
    logLevels: logLevelsFrom(config.LOG_LEVEL),
  });

  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.forRoot(config),
    { logger, bodyParser: false },
  );

  // Every cross-cutting HTTP concern (request context, content-type guard,
  // body parsing, request logging, validation, error handling, versioning,
  // shutdown hooks) lives in configureApp() — shared verbatim with every
  // API test, so a test app is configured identically to this one
  // (requirements.md AC11).
  configureApp(app);

  await app.listen(config.PORT, config.HOST);
}

void bootstrap();

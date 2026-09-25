import {
  StandardSchemaValidationPipe,
  VersioningType,
} from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { NextFunction, Request, Response } from "express";
import { AllExceptionsFilter } from "./common/errors/all-exceptions.filter";
import {
  JSON_BODY_LIMIT,
  JsonContentTypeGuardMiddleware,
} from "./common/http/json-body.middleware";
import { RequestLogMiddleware } from "./common/logging/request-log.middleware";
import { RequestContextMiddleware } from "./common/request-context/request-context.middleware";
import { validationExceptionFactory } from "./common/validation/validation";

// Every cross-cutting HTTP concern this service applies, in one place and
// one explicit order — shared by main.ts and every test that builds a real
// running app (test/app.e2e.test.ts, test/validation.e2e.test.ts), so a
// test app is configured identically to the production one
// (requirements.md AC11).
//
// The order below is load-bearing, not stylistic: sub-phase 6.3 wired this
// same set of concerns through AppModule's NestModule.configure() instead,
// and a live curl check against the built app (not caught by any test at
// the time) found a real 413 response missing its X-Request-Id and
// X-Correlation-Id headers — configure()-registered middleware binds
// during app.init(), strictly after an app.useBodyParser(...) call made
// right after NestFactory.create(). Registering everything here, through
// the identical app.use()/app.useBodyParser() mechanism, in this literal
// order, removes that ambiguity rather than working around it.
//
// Callers still pass `{ bodyParser: false }` to NestFactory.create() /
// createNestApplication() themselves — an option to that call, not
// something this function (which only ever receives an already-created
// app) can retroactively change.
export function configureApp(app: NestExpressApplication): void {
  // Don't advertise the framework (plan.md's "Conventions established"
  // table). Express's own default `X-Powered-By: Express` header is the
  // one piece of that table this function didn't apply until this was
  // caught in review.
  app.disable("x-powered-by");

  // Business routes are served under /v1; a controller opts out with
  // `@Controller({ version: VERSION_NEUTRAL })` (health.controller.ts is
  // the one example so far) — requirements.md AC10.
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });

  const requestContextMiddleware = new RequestContextMiddleware();
  const jsonContentTypeGuardMiddleware = new JsonContentTypeGuardMiddleware();
  const requestLogMiddleware = new RequestLogMiddleware();

  // 1. Establish ids and response headers before anything below can
  //    reject the request — including the body parser rejecting an
  //    oversized body.
  app.use((req: Request, res: Response, next: NextFunction) =>
    requestContextMiddleware.use(req, res, next),
  );
  // 2. Reject a non-JSON body outright (415), before any parsing.
  app.use((req: Request, res: Response, next: NextFunction) =>
    jsonContentTypeGuardMiddleware.use(req, res, next),
  );
  // 3. Size-limited JSON parsing (413 beyond JSON_BODY_LIMIT).
  app.useBodyParser("json", { limit: JSON_BODY_LIMIT });
  // 4. One log line per request, once it has finished; AppLogger reads the
  //    ids RequestContextMiddleware already established.
  app.use((req: Request, res: Response, next: NextFunction) =>
    requestLogMiddleware.use(req, res, next),
  );

  // Validation runs before any handler: a rejected request never reaches
  // domain code (requirements.md AC6). exceptionFactory maps Standard
  // Schema issues (Zod 4 schemas implement this spec) to exactly a
  // @contracts/common ContractError, thrown as an ApiException that
  // AllExceptionsFilter then serializes.
  app.useGlobalPipes(
    new StandardSchemaValidationPipe({
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  app.enableShutdownHooks();
}

import {
  agentIntentRequestSchema,
  type AgentIntentRequest,
} from "@contracts/agent-intents";
import { Body, Controller, Get, Post } from "@nestjs/common";

// Test-only: proves the global validation pipe and exception filter work
// against a real contract schema end to end (plan.md, Phase 6, OD5).
// Never registered in AppModule or main.ts — imported only by
// test/validation.e2e.test.ts's own testing module, matching "no
// production business route" (requirements.md AC13).
@Controller("test/validation-fixture")
export class ValidationFixtureController {
  @Post()
  handle(
    @Body({ schema: agentIntentRequestSchema }) body: AgentIntentRequest,
  ): AgentIntentRequest {
    return body;
  }

  // Exists only so a test can force the unmapped/unexpected branch of
  // AllExceptionsFilter (requirements.md AC7). The message is a marker the
  // test asserts never reaches the response body.
  @Get("boom")
  boom(): never {
    throw new Error("boom-secret-detail-9f3a");
  }
}

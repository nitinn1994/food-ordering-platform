import { Controller, Get, Query } from "@nestjs/common";
import {
  nudgesQuerySchema,
  type NudgesQuery,
  type NudgesResponse,
} from "@contracts/api-contracts";
import { NudgesService } from "./nudges.service";

// GET /v1/nudges?surface=<surface>[&itemId=<itemId>]. The query is
// validated by the global StandardSchemaValidationPipe against the contract
// schema, like every body and route parameter; a bad surface or itemId is
// the usual 400 INVALID_PAYLOAD (requirements.md AC-N4). An unknown but
// well-formed itemId is not an error: it simply matches no rule.
@Controller("nudges")
export class NudgesController {
  constructor(private readonly nudgesService: NudgesService) {}

  @Get()
  async getNudges(
    @Query({ schema: nudgesQuerySchema }) query: NudgesQuery,
  ): Promise<NudgesResponse> {
    return this.nudgesService.getNudges(query.surface, query.itemId);
  }
}

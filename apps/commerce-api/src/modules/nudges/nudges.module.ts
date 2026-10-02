import { Module } from "@nestjs/common";
import { CartModule } from "../cart/cart.module";
import { MenuModule } from "../menu/menu.module";
import { NudgeContextSource } from "./domain/nudge-context.source";
import { CommerceNudgeContextAdapter } from "./infrastructure/commerce-nudge-context.adapter";
import { NudgesController } from "./nudges.controller";
import { NudgesService } from "./nudges.service";

// The fourth domain module (docs/features/mcdelivery-redesign/plan.md,
// Phase 3). Read-only, with no repository and no table of its own: it reads
// the cart and the menu through their services and never writes.
@Module({
  imports: [MenuModule, CartModule],
  controllers: [NudgesController],
  providers: [
    NudgesService,
    { provide: NudgeContextSource, useClass: CommerceNudgeContextAdapter },
  ],
})
export class NudgesModule {}

import { z } from "zod";

// One integer major per schema family. A consumer must be able to reject a
// producer it does not understand; without a version on the wire, the first
// breaking change is silent. Semver is deliberately not used — this is a
// lockstep monorepo (ADR-0001), so nothing would ever consume a minor or
// patch number. See ADR-0012 and
// docs/features/phase-5-contract-foundation/requirements.md D5.
//
// In-major changes must be additive only: a new optional field, a new member
// of a union, a widened bound. Anything else bumps the major.

export const CONTRACT_VERSION = 1;

export const contractVersionSchema = z.literal(CONTRACT_VERSION);

export type ContractVersion = z.infer<typeof contractVersionSchema>;

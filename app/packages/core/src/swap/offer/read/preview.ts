import { appError, failed, isId, isTimeZone, ok, type Result } from "../../../kernel";
import { SPECIES_PROTECTION_NOTICE, type OfferDependencies, type OfferHealth } from "../types";
import { offerHealth } from "./health";

/** What the dialog "Offer for swapping" shows before anything is written (US-SOZ-08). */
export interface OfferPreview {
  readonly specimenName: string;
  /** `false`: the dialog offers to set the sharing first; an offer needs `Share = friends`. */
  readonly shared: boolean;
  readonly health: OfferHealth;
  readonly phase: "growth" | "dormancy" | null;
  /** The specimen already has an open or reserved offer. */
  readonly offered: boolean;
  /** Plant law notice (FR-SOZ-09): informs, never blocks. */
  readonly notice: string;
}

export async function offerPreview(
  deps: OfferDependencies,
  userId: string,
  specimenId: unknown,
  timeZone: unknown,
): Promise<Result<OfferPreview>> {
  if (!isId(specimenId) || !isTimeZone(timeZone))
    return failed(
      appError("input.invalid", {
        details: [
          ...(isId(specimenId) ? [] : [{ field: "specimenId", code: "input.invalid" as const }]),
          ...(isTimeZone(timeZone) ? [] : [{ field: "timeZone", code: "input.invalid" as const }]),
        ],
      }),
    );
  const specimen = await deps.specimens.find(userId, specimenId);
  if (!specimen) return failed(appError("specimen.not_found"));
  const [shared, offers] = await Promise.all([deps.sharing.list(userId), deps.offers.list(userId)]);
  return ok({
    specimenName: specimen.name,
    shared: shared.some((r) => r.specimenId === specimen.id),
    health: await offerHealth(deps, userId, specimen.id),
    phase: await deps.phases.phaseOf(userId, specimen.id, timeZone),
    offered: offers.some(
      (o) => o.specimenId === specimen.id && (o.status === "open" || o.status === "reserved"),
    ),
    notice: SPECIES_PROTECTION_NOTICE,
  });
}

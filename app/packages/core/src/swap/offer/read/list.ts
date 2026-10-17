import { appError, failed, isTimeZone, ok, type Result } from "../../../kernel";
import type { OfferDependencies, OfferHealth, OfferRow } from "../types";
import { offerHealth } from "./health";

/** An offer as the giver sees it: the stored fields plus what is derived on every read (P-01). */
export interface OfferView extends OfferRow {
  readonly specimenName: string | null;
  readonly health: OfferHealth;
  /** "dormancy" or "growth" today; `null` = no phase (cutting, species without dormancy period). */
  readonly phase: "growth" | "dormancy" | null;
}

/**
 * The caller's own offers with health details and the care phase of today (US-SOZ-08). Withdrawn and handed-over offers
 * stay in the list, so nothing disappears silently (P-10). `timeZone` decides what "today" is for the phase (NFR-08).
 */
export async function offerList(
  deps: OfferDependencies,
  userId: string,
  timeZone: unknown,
): Promise<Result<{ readonly offers: readonly OfferView[] }>> {
  if (!isTimeZone(timeZone))
    return failed(
      appError("input.invalid", { details: [{ field: "timeZone", code: "input.invalid" }] }),
    );
  const rows = await deps.offers.list(userId);
  const offers = await Promise.all(
    rows.map(async (o): Promise<OfferView> => ({
      ...o,
      specimenName: (await deps.specimens.find(userId, o.specimenId))?.name ?? null,
      health: await offerHealth(deps, userId, o.specimenId),
      phase: await deps.phases.phaseOf(userId, o.specimenId, timeZone),
    })),
  );
  return ok({ offers });
}

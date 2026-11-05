import { appError, failed, isTimeZone, ok, type Result } from "../../../kernel";
import type { OfferDependencies, OfferHealth, OfferRow } from "../types";
import { NO_OFFER_HEALTH, healthOf } from "./health";

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
 * The specimens, the health and the phases are each read once for all offers (NFR-12).
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
  const ids = rows.map((o) => o.specimenId);
  const [specimens, health, phases] = await Promise.all([
    deps.specimens.findMany(userId, ids),
    healthOf(deps, userId, ids),
    deps.phases.phasesOf(userId, ids, timeZone),
  ]);
  const names = new Map(ids.map((id, i) => [id, specimens[i]?.name ?? null] as const));
  const offers = rows.map((o): OfferView => ({
    ...o,
    specimenName: names.get(o.specimenId) ?? null,
    health: health.get(o.specimenId) ?? NO_OFFER_HEALTH,
    phase: phases.get(o.specimenId) ?? null,
  }));
  return ok({ offers });
}

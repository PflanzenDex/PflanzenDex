import {
  appError,
  defineOperation,
  failed,
  idField,
  localToday,
  ok,
  orNull,
  shape,
  textField,
  timeZoneField,
  type AppError,
  type Result,
} from "../../../../kernel";
import {
  planMarkers,
  speciesDisplayName,
  specimenName,
  type SpeciesSource,
  type SpecimenRow,
} from "../../../../collection";
import type { HandoverContext, HandoverSpecimen, HandoverSteps, HandoverStore } from "./ports";

const MARKER_LIMITS = { min: 1, max: 40 } as const;

export interface HandoverDependencies {
  readonly swaps: HandoverStore;
  readonly species: SpeciesSource;
  /** The clock comes from outside so that "today" is testable (NFR-08). */
  readonly clock: () => Date;
}

/** `waiting`: my confirmation is recorded, the other side has not confirmed yet; `handed_over`: the handover is done. */
export interface HandoverResult {
  readonly status: "waiting" | "handed_over";
  /** The specimen the recipient received; set only by the confirmation that completed the handover. */
  readonly receivedSpecimenId?: string | null;
}

const REFUSAL = {
  not_found: "swap.not_found",
  wrong_state: "swap.wrong_state",
  friendship_ended: "swap.friendship_ended",
} as const;

type Verdict = { readonly commit: boolean; readonly value: Result<HandoverResult> };
const refuse = (error: AppError, commit = false): Verdict => ({ commit, value: failed(error) });

/** The naming rule and the markers for the received specimen (DM-BES-03, US-BES-03); a refusal names the fix. */
function plan(
  species: { germanName: string | null; latinName: string },
  marker: string | null,
  siblings: readonly HandoverSpecimen[],
  speciesId: string,
) {
  const name = speciesDisplayName(species);
  const same = siblings.filter((z) => z.speciesId === speciesId) as readonly SpecimenRow[];
  return { name, plan: planMarkers({ speciesName: name, marker, answers: [], siblings: same }) };
}

interface Completion {
  readonly steps: HandoverSteps;
  readonly swapId: string;
  readonly ctx: HandoverContext;
  readonly userId: string;
  readonly today: string;
  readonly prepared: {
    readonly speciesId: string;
    readonly name: string;
    readonly assignments: readonly { specimenId: string; name: string; marker: string }[];
  };
}

async function complete(c: Completion): Promise<Verdict> {
  const { steps, swapId, ctx, userId, prepared, today } = c;
  const giver = ctx.role === "giver" ? userId : (ctx.otherId as string);
  const recipient = ctx.role === "giver" ? (ctx.otherId as string) : userId;
  const who = ctx.otherName ?? "einem Freund";
  const reason = ctx.mode === "give_away" ? `Verschenkt an ${who}` : `Getauscht mit ${who}`;
  await steps.archiveGiven(giver, ctx.specimenId as string, reason, today);
  const made = await steps.createReceived(
    recipient,
    {
      speciesId: prepared.speciesId,
      name: specimenName(prepared.name, ctx.marker),
      marker: ctx.marker,
      locationId: null,
      caughtAt: today,
      status: ctx.type === "plant" ? "plant" : "cutting",
    },
    prepared.assignments,
  );
  await steps.finish(swapId, ctx.specimenId as string, made.id);
  return { commit: true, value: ok({ status: "handed_over", receivedSpecimenId: made.id }) };
}

const schema = shape({
  swapId: idField("swapId"),
  timeZone: timeZoneField("timeZone"),
  marker: orNull(textField("marker", MARKER_LIMITS)),
});

interface Input {
  swapId: string;
  timeZone: string;
  marker: string | null;
}

const CODE = {
  name_taken: "specimen.name_taken",
  marker_taken: "specimen.marker_taken",
  species_unknown: "species.not_found",
  specimen_gone: "specimen.not_found",
} as const;

/** The two sides of the swap, from the caller's point of view. */
const sides = (ctx: HandoverContext, userId: string) => ({
  giver: ctx.role === "giver" ? userId : (ctx.otherId as string),
  recipient: ctx.role === "giver" ? (ctx.otherId as string) : userId,
});

/** Everything between the confirmation and the writes: the offered specimen, the species and the naming plan. */
async function prepare(
  deps: HandoverDependencies,
  steps: HandoverSteps,
  ctx: HandoverContext,
  userId: string,
) {
  const { giver, recipient } = sides(ctx, userId);
  const offered = await steps.giverSpecimen(giver, ctx.specimenId as string);
  if (!offered || offered.status === "archived") return refuse(appError("specimen.not_found"));
  const species = await deps.species.find(recipient, offered.speciesId);
  if (!species) return refuse(appError("species.not_found"));
  const p = plan(species, ctx.marker, await steps.recipientSpecimens(recipient), offered.speciesId);
  if (p.plan.kind === "failed") return refuse(p.plan.error);
  return { speciesId: offered.speciesId, name: p.name, assignments: p.plan.assignments };
}

async function confirmed(
  deps: HandoverDependencies,
  steps: HandoverSteps,
  call: { input: Input; userId: string; today: string },
): Promise<Verdict> {
  const { input, userId, today } = call;
  const ctx = await steps.confirm(input.swapId, input.marker);
  if (ctx.outcome === "already_handed_over")
    return { commit: false, value: ok({ status: "handed_over", receivedSpecimenId: null }) };
  if (ctx.outcome !== "ok")
    return refuse(appError(REFUSAL[ctx.outcome]), ctx.outcome === "friendship_ended");
  // The giver's early confirmation needs no plan; the recipient's own and the completing one do.
  if (ctx.role === "giver" && !ctx.both) return { commit: true, value: ok({ status: "waiting" }) };
  const prepared = await prepare(deps, steps, ctx, userId);
  if ("commit" in prepared) return prepared;
  if (!ctx.both) return { commit: true, value: ok({ status: "waiting" }) };
  return complete({ steps, swapId: input.swapId, ctx, userId, today, prepared });
}

/**
 * Confirms the handover of an accepted swap (US-SOZ-11, ADR 0012, FR-SOZ-05). It counts only when both sides confirmed:
 * the first confirmation is recorded and waits. The confirmation that completes it runs one transaction: the giver's
 * specimen is archived ("Getauscht mit <name>" or "Verschenkt an <name>", US-BES-07) and the recipient gets a new
 * specimen of the same species under the naming rule (DM-BES-03; a cutting or offshoot becomes a cutting, US-BES-04;
 * caught date = the local handover date in the confirming person's time zone, NFR-08; location unknown, P-08; private,
 * no sharing row). Measurements, treatments and location of the giver are not passed on. The recipient names a marker
 * when the naming rule asks for one (assumption, decided by the PO: asked at the recipient's own confirmation; the
 * markers of further existing specimens are not asked here and refuse with `specimen.markers_missing`). If any step
 * is refused (taken name, species not visible to the recipient, specimen gone) nothing is written, the swap stays
 * `accepted` and the error says why (P-10). The same Idempotency-Key replays the first answer (US-QS-03).
 */
export const swapHandover = (deps: HandoverDependencies) =>
  defineOperation<Input, HandoverResult>({
    name: "swap.handover",
    schema,
    run: async ({ userId }, input) => {
      const today = localToday(deps.clock(), input.timeZone);
      const done = await deps.swaps.handover<Result<HandoverResult>>(userId, (steps) =>
        confirmed(deps, steps, { input, userId, today }),
      );
      return typeof done === "object" && "refused" in done
        ? failed(appError(CODE[done.refused]))
        : done;
    },
  });

import {
  appError,
  defineOperation,
  failed,
  idField,
  ok,
  orNull,
  shape,
  textField,
  type ErrorDetail,
} from "../../../kernel";
import { offerHealth } from "../read/health";
import {
  OFFER_LIMITS,
  OFFER_MODES,
  OFFER_TYPES,
  type OfferDependencies,
  type OfferMode,
  type OfferRow,
  type OfferType,
} from "../types";

const choice =
  <V extends string>(field: string, allowed: readonly V[]) =>
  (value: unknown): V | ErrorDetail =>
    (allowed as readonly unknown[]).includes(value)
      ? (value as V)
      : { field, code: "input.invalid" };

/** `confirmTreatment` is optional and means "no" when left out. */
const flag = (field: string) => (value: unknown) =>
  value === undefined || value === null
    ? false
    : typeof value === "boolean"
      ? value
      : ({ field, code: "input.invalid" } as ErrorDetail);

interface Input {
  specimenId: string;
  type: OfferType;
  mode: OfferMode;
  wish: string | null;
  note: string | null;
  confirmTreatment: boolean;
}

/**
 * Offers a specimen for swapping or giving away (US-SOZ-08, P-03). Only an own, active specimen with `Share = friends`
 * can be offered (`offer.not_shared` otherwise: the screen offers to set the sharing); a specimen has at most one open
 * offer (`offer.already_open`); a specimen with an open treatment is offered only after the keeper confirmed that
 * explicitly (`offer.treatment_open`, the treatments carry no pest category, so every open treatment counts: assumption,
 * decided by the PO). A foreign or unknown specimen is `specimen.not_found` (P-04). Nothing is written on refusal.
 */
export const offerCreate = (deps: OfferDependencies) =>
  defineOperation<Input, OfferRow>({
    name: "offer.create",
    schema: shape({
      specimenId: idField("specimenId"),
      type: choice("type", OFFER_TYPES),
      mode: choice("mode", OFFER_MODES),
      wish: orNull(textField("wish", OFFER_LIMITS.wish)),
      note: orNull(textField("note", OFFER_LIMITS.note)),
      confirmTreatment: flag("confirmTreatment"),
    }),
    run: async ({ userId }, input) => {
      const specimen = await deps.specimens.find(userId, input.specimenId);
      if (!specimen) return failed(appError("specimen.not_found"));
      if (specimen.status === "archived") return failed(appError("specimen.archived"));
      const shared = (await deps.sharing.list(userId)).some((r) => r.specimenId === specimen.id);
      if (!shared) return failed(appError("offer.not_shared"));
      if (!input.confirmTreatment && (await offerHealth(deps, userId, specimen.id)).treatmentOpen)
        return failed(appError("offer.treatment_open"));
      const r = await deps.offers.create(userId, {
        specimenId: specimen.id,
        type: input.type,
        mode: input.mode,
        wish: input.wish,
        note: input.note,
      });
      return r === "already_open" ? failed(appError("offer.already_open")) : ok(r);
    },
  });

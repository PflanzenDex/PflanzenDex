import type { SpecimenCard } from "@pflanzendex/core";
import { texts } from "@/shared/lib/text-rules/texts";
import { useRequest } from "../../../../../shared/data";
import { loadCard } from "../../../../specimens/cards/cards-api";
import { COLLECTION_KEY, type Token } from "../../../../specimens/hooks/use-collection";
import table from "./address.de.json";

const t = texts(table);
/** The German texts of the form addresses, for the views that show them. */
export const formText = t;

/** The notice that closes a form whose plant is not there (P-10). */
export const NOT_FOUND = t("notFound");

/** The query parameters of a form of a plant (US-QS-15): `?form=<kind>&plant=<id>`, the way layers use `?sheet=`. */
export const FORM_PARAM = "form";
export const PLANT_PARAM = "plant";
/** The layer parameter, which a form drops: a layer and a form are never open at once. */
export const SHEET_PARAM = "sheet";
/** The forms that are full views with an address (US-QS-15); the other plant forms stay as they are. */
export const FORM_KINDS = [
  "measure",
  "marker",
  "catch-date",
  "archive-plant",
  "repot",
  "light-zone",
] as const;
export type FormKind = (typeof FORM_KINDS)[number];

/** History state of the entry the app pushed for a form: Back from it returns to the view before (US-QS-15). */
export const FROM_APP = "formFromApp";
/** History state of the entry above a form whose typed input is unsaved: Back from the form then asks first. */
export const GUARD = "formGuard";

/** The form the address names, if the plant is named too. */
export function formOf(search: string): { kind: FormKind; plantId: string } | null {
  const params = new URLSearchParams(search);
  const kind = FORM_KINDS.find((k) => k === params.get(FORM_PARAM));
  const plantId = params.get(PLANT_PARAM);
  return kind && plantId ? { kind, plantId } : null;
}

/** The search without the form, its plant and the layer, as the list shows it. */
export function listSearch(search: string): string {
  const params = new URLSearchParams(search);
  params.delete(FORM_PARAM);
  params.delete(PLANT_PARAM);
  params.delete(SHEET_PARAM);
  const text = params.toString();
  return text ? `?${text}` : "";
}

export const stateFlag = (state: unknown, flag: string): boolean =>
  (state as Record<string, unknown> | null)?.[flag] === true;

/** The state of a guard entry: it belongs to the form below it, so it keeps the app flag of that form. */
export const guardState = (state: unknown) => ({
  [GUARD]: true,
  keepFocus: true,
  [FROM_APP]: stateFlag(state, FROM_APP),
});

export type FormAddress = {
  /** The open form of the plant, `null` when no form is addressed (or the view is not the plants). */
  kind: FormKind | null;
  plantId: string | null;
  /** Opens a form of a plant: pushes an address, so Back closes it and returns to the view before (US-QS-15). */
  open: (kind: FormKind, plantId: string) => void;
  /** Closes the form and the layer it came from: the list shows, with `notice` if it says why (P-10). For a saved write. */
  leave: (notice?: string) => void;
  /** Leaves on purpose (a cancel or back control): asks first when typed input is unsaved, then closes to the list. */
  requestLeave: () => void;
  /** Notes input in the open form (typed text, a picked file); the first one arms the guard against Back. */
  typed: () => void;
  /** Input has been saved and the form stays open: nothing is unsaved any more. */
  settle: () => void;
  /** The question "Eingabe verwerfen?" is open. */
  asking: boolean;
  /** "Weiter bearbeiten": keeps the form and its input. */
  keepEditing: () => void;
  /** "Verwerfen": leaves the form and its input, the way the question was asked. */
  discard: () => void;
  /** A notice of the last close, e.g. that the plant is not there (P-10). */
  notice: string | null;
};

/** The plant of an open form: its card, and whether it could not be read (P-10). */
export type FormPlant = { card: SpecimenCard | undefined; failed: boolean };

/** The plant of an open form, read by its ID (US-BES-06); a plant that is archived is not read here. */
export function useFormPlant(api: string, token: Token, plantId: string | null): FormPlant {
  const request = useRequest({
    queryKey: [...COLLECTION_KEY, "card", plantId ?? ""],
    token,
    enabled: plantId !== null,
    load: (tok) => loadCard(api, tok, plantId ?? ""),
  });
  return { card: request.value, failed: request.status === "error" };
}

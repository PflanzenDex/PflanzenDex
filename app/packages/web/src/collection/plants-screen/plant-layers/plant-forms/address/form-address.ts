import type { SpecimenCard } from "@pflanzendex/core";
import { texts } from "@/shared/lib/text-rules/texts";
import { plantLayerId } from "@/shared/patterns/navigation/navigation/navigation";
import { dropLayerParts } from "@/shared/patterns/responsive/layer-sheet/use-layer.history";
import { useRequest } from "../../../../../shared/data";
import { loadCard } from "../../../../specimens/cards/cards-api";
import { COLLECTION_KEY, type Token } from "../../../../specimens/hooks/use-collection";
import { ARCHIVE_LAYER } from "../../layer-ids";
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
/**
 * Where a form was opened from, when that is not the plant's layer: `origin=archive` for a form opened from the Archiv layer
 * (US-QS-32, owner decision d-054). The address carries it, so a reload puts the same layer below the form.
 */
export const ORIGIN_PARAM = "origin";
/** The form of the archive: its plant leaves the list with the save, so it is the one form that closes to the list (US-QS-32). */
export const ARCHIVE_PLANT = "archive-plant" as const;
/** The forms that are full views with an address (US-QS-15); the other plant forms stay as they are. */
export const FORM_KINDS = [
  "measure",
  "marker",
  "catch-date",
  ARCHIVE_PLANT,
  "repot",
  "light-zone",
] as const;
export type FormKind = (typeof FORM_KINDS)[number];

/** History state of the entry the app pushed for a form: Back from it returns to the entry below it, the plant's layer (US-QS-32). */
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

/** Whether the address names the Archiv layer as the one the form was opened from (`ORIGIN_PARAM`). */
export const originIsArchive = (search: string): boolean =>
  new URLSearchParams(search).get(ORIGIN_PARAM) === ARCHIVE_LAYER;

/** The parameters of a form leave the search: the form, its plant and its origin. */
function dropFormParts(params: URLSearchParams): void {
  params.delete(FORM_PARAM);
  params.delete(PLANT_PARAM);
  params.delete(ORIGIN_PARAM);
}

/**
 * The address of a form of a plant, opened from the entry with `search`: the layer is dropped (a layer and a form are never
 * open at once), and the Archiv layer stays as the form's `origin` (US-QS-32, d-054).
 */
export function formSearch(search: string, kind: FormKind, plantId: string): string {
  const params = new URLSearchParams(search);
  const archive = params.get(SHEET_PARAM) === ARCHIVE_LAYER;
  params.delete(SHEET_PARAM);
  dropFormParts(params);
  params.set(FORM_PARAM, kind);
  params.set(PLANT_PARAM, plantId);
  if (archive) params.set(ORIGIN_PARAM, ARCHIVE_LAYER);
  return `?${params}`;
}

/** The search without the form, its plant and the layer (with its tab and parts), as the list shows it. */
export function listSearch(search: string): string {
  const params = new URLSearchParams(search);
  dropFormParts(params);
  dropLayerParts(params);
  const text = params.toString();
  return text ? `?${text}` : "";
}

/**
 * The search of the plant's layer, the entry below a form (US-QS-32, SG-NAV-05, owner answer Q-46): the form's own address
 * without the form and its plant, with the layer of the plant. The tab the form was opened from stays in the address, so
 * the layer opens on it.
 */
export function layerSearch(search: string, plantId: string): string {
  const params = new URLSearchParams(search);
  dropFormParts(params);
  params.set(SHEET_PARAM, plantLayerId(plantId));
  return `?${params}`;
}

/** The search of the Archiv layer, the entry below a form opened from it (US-QS-32, d-054): no form, no tab of a plant. */
export function archiveSearch(search: string): string {
  const params = new URLSearchParams(search);
  dropFormParts(params);
  dropLayerParts(params);
  params.set(SHEET_PARAM, ARCHIVE_LAYER);
  return `?${params}`;
}

/**
 * The entry below a form that the history does not name yet (a reload): the Archiv layer when the address says the form came
 * from there (d-054), else the plant's layer, else the list.
 */
export function fallbackBelow(location: { pathname: string; search: string }, plantId?: string) {
  const { pathname, search } = location;
  if (originIsArchive(search)) return { pathname, search: archiveSearch(search) };
  return { pathname, search: plantId ? layerSearch(search, plantId) : listSearch(search) };
}

export const stateFlag = (state: unknown, flag: string): boolean =>
  (state as Record<string, unknown> | null)?.[flag] === true;

/** The state of a guard entry: it belongs to the form below it, so it keeps the app flag of that form. */
export const guardState = (fromApp: boolean) => ({
  [GUARD]: true,
  keepFocus: true,
  [FROM_APP]: fromApp,
});

export type FormAddress = {
  /** The open form of the plant, `null` when no form is addressed (or the view is not the plants). */
  kind: FormKind | null;
  plantId: string | null;
  /** The open form came from the Archiv layer, so its back control names the Archiv and leads there (US-QS-32, d-054). */
  fromArchive: boolean;
  /**
   * Opens a form of a plant: pushes an address above the entry it is opened from (the plant's layer, or the Archiv layer),
   * so Back closes it and returns there (US-QS-15, US-QS-32).
   */
  open: (kind: FormKind, plantId: string) => void;
  /**
   * Closes the form after a saved write: the layer it came from shows again, with `notice` if it says why (P-10). With
   * `toList` the layer is left too and the list shows: for a plant that has left it (archived, or not there).
   */
  leave: (notice?: string, toList?: boolean) => void;
  /** Leaves on purpose (a cancel or back control): asks first when typed input is unsaved, then closes to the plant's layer. */
  requestLeave: () => void;
  /** Notes input in the open form (typed text, a picked file); the first one arms the guard against Back. */
  typed: () => void;
  /** Input has been saved and the form stays open: nothing is unsaved any more. */
  settle: () => void;
  /** The question "Eingabe verwerfen?" is open. */
  asking: boolean;
  /** "Weiter bearbeiten": keeps the form and its input. */
  keepEditing: () => void;
  /** "Eingabe verwerfen": leaves the form and its input, the way the question was asked. */
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

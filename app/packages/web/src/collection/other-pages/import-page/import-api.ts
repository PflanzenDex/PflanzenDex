// The HTTP side of the CSV import of plants (US-BES-18, FR-BES-26): the template, the size check of the browser, the preview
// (a read, sent as POST without a repeat key) and the confirmation (the one guarded write). The answers are the core's shapes.
import type { Fixes } from "./import-flow";
import {
  IMPORT_LIMITS,
  type ConfirmResult,
  type ImportPreview,
  type PreviewRow,
} from "@pflanzendex/core";
import { call, currentTimeZone, type Response, type WriteOptions, writeFor } from "@/shared/data";

/** The one line of the template: the column names, nothing else (an example row would be imported as a real plant). */
export const TEMPLATE_HEADER = "Art;Spitzname;Standort;Kaufdatum;Notizen";

/** The template as a Blob, generated in the browser (US-BES-18). */
export const templateBlob = (): Blob =>
  new Blob([`${TEMPLATE_HEADER}\n`], { type: "text/csv;charset=utf-8" });

/** A file the browser refuses before it is sent: over the size limit of FR-BES-26 (the server's own check stays). */
export const tooLarge = (file: { readonly size: number }): boolean =>
  file.size > IMPORT_LIMITS.bytes;

/** A fix of a row as the page sends it: only the keys the keeper gave (`overrides` of the preview, FR-BES-26). */
export interface RowFix {
  speciesId?: string;
  marker?: string;
  skip?: boolean;
}

/** A marker the keeper answered for an existing specimen (US-BES-03); `speciesId` is kept for the confirmation's filter. */
export interface MarkerAnswer {
  specimenId: string;
  speciesId: string;
  marker: string;
}

/** The body of the preview: the file, the fixes by line, the marker answers. The time zone decides "today" (NFR-08). */
export interface PreviewInput {
  readonly csv: string;
  readonly overrides: readonly ({ line: number } & RowFix)[];
  readonly markers: readonly { specimenId: string; marker: string }[];
}

/** One ready row of the last preview as the confirmation takes it (P-03: the server checks it again). */
export interface ConfirmRow {
  line: number;
  speciesId: string;
  marker: string | null;
  locationId: string | null;
  newLocation: string | null;
  catchDate: string | null;
  notes: string | null;
}

/** The preview of the file; a refusal of the whole file comes back as the error (nothing is written). */
export async function sendPreview(
  api: string,
  token: string,
  input: PreviewInput,
): Promise<Response<ImportPreview>> {
  return call<ImportPreview>(fetch, `${api}/specimens/import/preview`, token, {
    method: "POST",
    body: { ...input, timeZone: currentTimeZone() },
  });
}

/** The confirmation of the ready rows, guarded by a repeat key per logical write (US-QS-03). */
export async function sendImport(
  api: string,
  token: string,
  input: {
    rows: readonly ConfirmRow[];
    markers: readonly { specimenId: string; marker: string }[];
  },
  options: WriteOptions = {},
): Promise<Response<ConfirmResult>> {
  const r = await writeFor(api, token, options)("POST", "/specimens/import", {
    ...input,
    timeZone: currentTimeZone(),
  });
  return r.ok ? { ok: true, value: r.value as ConfirmResult } : r;
}

/** The fixes as the preview takes them: one entry per line, with the keys the keeper gave. */
export const overridesOf = (fixes: Fixes) =>
  Object.entries(fixes).map(([line, fix]) => ({ line: Number(line), ...fix }));

export const withoutSpecies = (a: MarkerAnswer) => ({ specimenId: a.specimenId, marker: a.marker });

/** A ready row as the confirmation takes it: a chosen location by ID, a new one by its name (created once, US-BES-18). */
export const confirmRow = (
  r: PreviewRow & { readonly species: { readonly id: string } },
): ConfirmRow => ({
  line: r.line,
  speciesId: r.species.id,
  marker: r.marker,
  locationId: r.location && !r.location.isNew ? r.location.id : null,
  newLocation: r.location?.isNew ? r.location.name : null,
  catchDate: r.catchDate,
  notes: r.notes,
});

export const isReady = (
  r: PreviewRow,
): r is PreviewRow & { readonly species: { readonly id: string } } =>
  r.state === "ready" && r.species.id !== null;

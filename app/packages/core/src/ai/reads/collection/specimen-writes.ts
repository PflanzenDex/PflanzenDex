// Keeping the specimens through the AI client (US-KI-14, KI-R10): which app operation each write tool runs, which of its
// arguments are references the server resolves by id or by name (FR-KI-15) and which fields go to the operation as they
// are. Everything else is dropped before the operation sees it, so a field that is human-only (the private notes,
// FR-KI-22) never reaches it. Meaning and limits of the fields stay with the operation (P-03).
import {
  appError,
  failed,
  isId,
  jsonSchemaOf,
  ok,
  type JsonSchema,
  type Result,
} from "../../../kernel";
import { resolveSpecies, type ReadDependencies } from "./catalog-reads";
import { referenceError, resolveName, type Named } from "../naming";
import { resolveSpecimen } from "./collection-reads";
import { collectionView, type CollectionView } from "./views";

/** The write tools of the specimens; each name is its operation in AI_OPERATION_CLASSES (class `write`, FR-KI-12). */
export const SPECIMEN_WRITES = [
  "create_specimen",
  "set_specimen_marker",
  "correct_catch_date",
  "set_specimen_location",
  "set_specimen_light_zone",
  "repot_specimen",
  "restore_specimen",
] as const;
export type SpecimenWrite = (typeof SPECIMEN_WRITES)[number];

type RefKind = "species" | "specimen" | "location" | "lightZone";

/** A reference argument: what it names and the id field of the operation it fills. */
interface Ref {
  readonly kind: RefKind;
  readonly to: string;
}

interface WriteSpec {
  readonly refs: Readonly<Record<string, Ref>>;
  /** Fields of the operation taken as they are; the operation checks them. */
  readonly pass: readonly string[];
}

const SPECIMEN: Readonly<Record<string, Ref>> = {
  specimen: { kind: "specimen", to: "specimenId" },
};
const LOCATION: Ref = { kind: "location", to: "locationId" };
const ZONE: Ref = { kind: "lightZone", to: "lightZoneId" };

export const SPECIMEN_WRITE_SPECS: Readonly<Record<SpecimenWrite, WriteSpec>> = {
  create_specimen: {
    refs: { species: { kind: "species", to: "speciesId" }, location: LOCATION, lightZone: ZONE },
    pass: ["timeZone", "marker", "markers", "status", "catchDate"],
  },
  set_specimen_marker: { refs: SPECIMEN, pass: ["marker"] },
  correct_catch_date: { refs: SPECIMEN, pass: ["timeZone", "catchDate"] },
  set_specimen_location: { refs: { ...SPECIMEN, location: LOCATION }, pass: [] },
  set_specimen_light_zone: { refs: { ...SPECIMEN, lightZone: ZONE }, pass: [] },
  repot_specimen: { refs: SPECIMEN, pass: ["timeZone", "date", "potId"] },
  restore_specimen: { refs: SPECIMEN, pass: [] },
};

/** The longest reference the server resolves (the read tools take the same, US-KI-11). */
export const REFERENCE_LENGTH = { min: 1, max: 200 } as const;

/**
 * The tool's input schema, derived from the operation's own check (FR-KI-17): each id field becomes its reference
 * argument (a string, required and nullable exactly as the id), the passed fields keep their schema, others are left out.
 */
export function writeInputSchema(write: SpecimenWrite, opSchema: object): JsonSchema {
  const op = (jsonSchemaOf(opSchema) ?? {}) as {
    properties?: Record<string, JsonSchema>;
    required?: readonly string[];
  };
  const props = op.properties ?? {};
  const required = new Set(op.required ?? []);
  const { refs, pass } = SPECIMEN_WRITE_SPECS[write];
  const refJson = (to: string): JsonSchema => {
    const nullable = ([] as unknown[]).concat(props[to]?.["type"]).includes("null");
    const type = nullable ? ["string", "null"] : "string";
    return { type, minLength: REFERENCE_LENGTH.min, maxLength: REFERENCE_LENGTH.max };
  };
  const refEntries = Object.entries(refs).map(([k, r]) => [k, refJson(r.to)] as const);
  const passEntries = pass.filter((k) => props[k]).map((k) => [k, props[k] as JsonSchema] as const);
  return {
    type: "object",
    properties: Object.fromEntries([...refEntries, ...passEntries]),
    required: [
      ...Object.entries(refs)
        .filter(([, r]) => required.has(r.to))
        .map(([k]) => k),
      ...pass.filter((k) => required.has(k)),
    ],
    additionalProperties: false,
  };
}

const NO_MORE_NAMES = (): string[] => [];
const named = (
  items: readonly { id: string; name: string }[],
  extra: (id: string) => string[] = NO_MORE_NAMES,
) => items.map((i): Named => ({ id: i.id, label: i.name, names: [i.name, ...extra(i.id)] }));

const NOT_FOUND = {
  species: "species.not_found",
  specimen: "specimen.not_found",
  location: "location.not_found",
  lightZone: "light_zone.not_found",
} as const;

const notOwn = (field: string, kind: RefKind) =>
  appError(NOT_FOUND[kind], {
    details: [{ field, code: NOT_FOUND[kind] }],
    data: { field, nearest: [] },
  });

/** Where references are resolved: the account and its collection, loaded once per call. */
interface Scope {
  readonly deps: ReadDependencies;
  readonly userId: string;
  readonly view: CollectionView;
}

/** A visible species; a foreign proposal's id answers `not_found` like an unknown one (P-04). */
async function speciesRef(scope: Scope, field: string, value: string): Promise<Result<string>> {
  const id = await resolveSpecies(scope.deps, scope.userId, value, field);
  if (!id.ok || !isId(value)) return id;
  const visible = await scope.deps.source.species(scope.userId, id.value);
  return visible ? id : failed(notOwn(field, "species"));
}

/** One of the account's specimens, active ones first, then the archive (US-BES-07). */
function specimenRef(view: CollectionView, field: string, value: string): Result<string> {
  const id = resolveSpecimen(view.rows, value);
  if (!id.ok) return failed({ ...id.error, details: [{ field, code: id.error.code }] });
  return view.rows.some((s) => s.id === id.value) ? id : failed(notOwn(field, "specimen"));
}

/** One of the account's locations or light zones; a zone also answers to its number. */
function placeRef(
  view: CollectionView,
  field: string,
  kind: "location" | "lightZone",
  value: string,
): Result<string> {
  const zoneNumber = (id: string) => [String(view.zoneNumbers.get(id) ?? "")];
  const items = kind === "location" ? named(view.locations) : named(view.zones, zoneNumber);
  const r = resolveName(items, value);
  if (r.kind !== "found") return failed(referenceError(r, field, NOT_FOUND[kind]));
  return items.some((i) => i.id === r.id) ? ok(r.id) : failed(notOwn(field, kind));
}

/** One reference argument: missing stays missing (`null` result), `null` clears, a text is resolved (FR-KI-15). */
async function refValue(
  scope: Scope,
  field: string,
  kind: RefKind,
  value: unknown,
): Promise<Result<string | null> | null> {
  if (value === undefined) return null;
  if (value === null) return ok(null);
  if (typeof value !== "string" || value.trim() === "" || value.length > REFERENCE_LENGTH.max)
    return failed(appError("input.invalid", { details: [{ field, code: "input.invalid" }] }));
  if (kind === "species") return speciesRef(scope, field, value);
  if (kind === "specimen") return specimenRef(scope.view, field, value);
  return placeRef(scope.view, field, kind, value);
}

/** The resolved input of the operation and the specimen it targets (null for a new one). */
export interface ResolvedWrite {
  readonly input: Readonly<Record<string, unknown>>;
  readonly specimenId: string | null;
  readonly view: CollectionView;
}

/** The operation's input: references resolved within the account (FR-KI-15, KI-R4), only listed fields passed on. */
export async function resolveWrite(
  deps: ReadDependencies,
  userId: string,
  write: SpecimenWrite,
  args: unknown,
): Promise<Result<ResolvedWrite>> {
  const raw = (typeof args === "object" && args !== null ? args : {}) as Record<string, unknown>;
  const view = await collectionView(deps.source, userId, "UTC");
  const { refs, pass } = SPECIMEN_WRITE_SPECS[write];
  const input: Record<string, unknown> = {};
  for (const k of pass) if (raw[k] !== undefined) input[k] = raw[k];
  const scope = { deps, userId, view };
  for (const [field, ref] of Object.entries(refs)) {
    const r = await refValue(scope, field, ref.kind, raw[field]);
    if (r === null) continue;
    if (!r.ok) return r;
    input[ref.to] = r.value;
  }
  const specimenId = typeof input["specimenId"] === "string" ? input["specimenId"] : null;
  return ok({ input, specimenId, view });
}

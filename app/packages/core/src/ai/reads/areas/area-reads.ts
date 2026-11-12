// The read operations of every other area (US-KI-12): one thin read per area over the app's own function (KI-R10). The
// value is the app's answer, never recomputed (P-01, KI-R2); what the app does not know stays `null` = unknown (P-08).
// Lists are paged with the app's order (FR-KI-16); free texts are named as data (FR-KI-07).
import {
  appError,
  failed,
  ok,
  shape,
  textField,
  timeZoneField,
  type Schema,
} from "../../../kernel";
import type { AiLogStore } from "../../status";
import { resolveSpecimen } from "../collection/collection-reads";
import { PAGE_FIELDS, pageOf, readCall, type CollectionReadSource, type ReadCall } from "../types";
import { AREA_READS, type AreaName, type AreaRead, type AreaReadSource } from "./area-source";

export interface AreaReadDependencies {
  /** The collection, to resolve a specimen named by the client (FR-KI-15). */
  readonly source: CollectionReadSource;
  readonly areas: AreaReadSource;
  readonly log: AiLogStore;
}

type Input = {
  readonly timeZone?: string;
  readonly specimen?: string;
  readonly offset?: number | null;
  readonly limit?: number | null;
};

const specimenField = textField("specimen", { min: 1, max: 200 });
const NEEDS = {
  nothing: {},
  timeZone: { timeZone: timeZoneField("timeZone") },
  specimen: { specimen: specimenField },
} as const;

/** The input check of an area's tool: what the area needs, plus paging for a list (FR-KI-16). */
export function areaSchema(name: AreaName): Schema<Input> {
  const def: AreaRead = AREA_READS[name];
  const paging = def.list === null ? {} : PAGE_FIELDS;
  return shape({ ...NEEDS[def.needs], ...paging }) as unknown as Schema<Input>;
}

/** The app's answer as the tool answers it: the list paged under `items`, every free text named as data. */
function answerOf(def: AreaRead, value: object, input: Input) {
  if (def.list === null) return { ...value, dataFields: [...def.data] };
  const { [def.list]: all, ...rest } = value as Record<string, unknown>;
  const list = Array.isArray(all) ? (all as readonly unknown[]) : [];
  const page = pageOf(list, { offset: input.offset ?? null, limit: input.limit ?? null });
  // A field beside the list (a key of the rest, e.g. `specimens[].name`) keeps its path; every other is the items'.
  const beside = (f: string) => (f.split(/[.[]/)[0] ?? f) in rest;
  const marked = def.data.map((f) => (beside(f) ? f : `items[].${f}`));
  return { ...rest, ...page, dataFields: marked };
}

async function specimenOf(deps: AreaReadDependencies, userId: string, ref: string | undefined) {
  if (ref === undefined) return ok(null);
  const rows = await deps.source.specimens(userId, "UTC");
  const id = resolveSpecimen(rows, ref);
  // An id passes the name resolution unchanged; one that is not the account's answers like an unknown one (P-04).
  if (id.ok && !rows.some((s) => s.id === id.value))
    return failed(appError("specimen.not_found", { data: { nearest: [] } }));
  return id;
}

/** The read operation of one area (US-KI-12): right, input, the app's function, log (FR-KI-19). */
export const aiAreaRead = (name: AreaName) => (deps: AreaReadDependencies, call: ReadCall) => {
  const def: AreaRead = AREA_READS[name];
  return readCall(deps, call, name, {
    schema: areaSchema(name),
    run: async (input) => {
      const specimenId = await specimenOf(deps, call.userId, input.specimen);
      if (!specimenId.ok) return specimenId;
      const r = await deps.areas[name](call.userId, {
        timeZone: input.timeZone ?? null,
        specimenId: specimenId.value,
        connectionId: call.connectionId,
      });
      return r.ok ? ok(answerOf(def, r.value, input)) : r;
    },
    effect: (v) =>
      "total" in v ? `${v.items.length} of ${v.total} entries` : "one view of the area",
  });
};

/**
 * A call for friends' data, sharing, offers, swaps, partner data or a human-only function (FR-KI-10, FR-KI-22): never
 * released, refused with `ai.not_released` and logged like every call (FR-KI-19), whatever the connection's rights.
 */
export async function aiNotReleased(
  deps: { readonly log: AiLogStore },
  call: ReadCall,
  operation: string,
) {
  await deps.log.record(
    call.userId,
    { connectionId: call.connectionId, operation, effect: "refused: ai.not_released" },
    call.now,
  );
  return failed(appError("ai.not_released", { data: { operation } }));
}

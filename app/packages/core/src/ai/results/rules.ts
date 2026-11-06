// Rule discovery of the AI interface (US-KI-13, FR-KI-17): what a client must respect before it writes, read up front
// instead of learned from error texts. Per area the input schema, class and right of every released operation, the
// naming rule of the catalog, and every error code with its meaning. Nothing here is account data: the description is
// the same for every account (P-04). The schemas and the naming rule come from the checks themselves (`jsonSchemaOf`,
// LATIN_NAME_RULE), handed in by the app as a port so `ai` stays apart from `catalog`; the classes come from the one
// table AI_OPERATION_CLASSES.
import { ERROR_TEXTS, ok, shape, textField, type JsonSchema } from "../../kernel";
import { readCall, type ReadCall } from "../reads/types";
import { AI_OPERATION_CLASSES, rightNeeded } from "../rights";
import type { AiLogStore } from "../status";

/** Raised when a change of the rules is not backward compatible (FR-KI-03); `revision` changes with every change. */
export const RULES_VERSION = 1;

/** One released operation as the app offers it to the client (an MCP tool). */
export interface RuleOperation {
  readonly tool: string;
  readonly title: string;
  /** Key in AI_OPERATION_CLASSES. */
  readonly operation: string;
  /** Derived from the operation's check (`jsonSchemaOf`), with a description per field. */
  readonly inputSchema: JsonSchema;
  readonly readOnly: boolean;
}

export interface RuleArea {
  readonly area: string;
  readonly operations: readonly RuleOperation[];
}

/** The verdict of the dry name check: the normal form, or the code the proposal would return with its reason. */
export interface NameVerdict {
  readonly valid: boolean;
  readonly code?: string;
}

/** Port: the released operations per area, and the naming rule and its check of the catalog (US-KI-13). */
export interface RulesSource {
  readonly areas: readonly RuleArea[];
  readonly naming: object;
  readonly checkName: (name: string) => NameVerdict;
}

export interface RulesDependencies {
  readonly rules: RulesSource;
  readonly log: AiLogStore;
}

// FNV-1a (32 bit): a short, stable fingerprint of the description, so a client sees that something changed.
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const HEX = 16;
const REVISION_LENGTH = 8;
function fingerprint(text: string): string {
  let hash = FNV_OFFSET;
  for (const ch of text) hash = Math.imul(hash ^ (ch.codePointAt(0) ?? 0), FNV_PRIME) >>> 0;
  return hash.toString(HEX).padStart(REVISION_LENGTH, "0");
}

const ERROR_NOTE =
  "Every refusal carries one of these stable codes; meaning is the text the keeper sees (German). Decide by the " +
  "code, never by the text. Field problems name the field in details[].";

/** The full description: the same for every account, versioned (FR-KI-03). */
export function describeRules(source: RulesSource) {
  const areas = source.areas.map((a) => ({
    area: a.area,
    operations: a.operations.map((o) => ({
      ...o,
      class: AI_OPERATION_CLASSES[o.operation] ?? null,
      right: rightNeeded(o.operation),
    })),
  }));
  const notReleased = Object.entries(AI_OPERATION_CLASSES)
    .filter(([op]) => rightNeeded(op) === null)
    .map(([op]) => op);
  const errors = {
    note: ERROR_NOTE,
    codes: Object.entries(ERROR_TEXTS).map(([code, meaning]) => ({ code, meaning })),
  };
  const body = { areas, notReleased, naming: source.naming, errors };
  return { version: RULES_VERSION, revision: fingerprint(JSON.stringify(body)), ...body };
}

export type RulesDescription = ReturnType<typeof describeRules>;

export const describeRulesSchema = shape({});
/** A name to check; the limit only guards the request, the naming rule decides. */
const CHECK_NAME = { min: 1, max: 200 };
export const checkSpeciesNameSchema = shape({ name: textField("name", CHECK_NAME) });

/** The rule discovery (read right, US-KI-13); one log entry per call (FR-KI-19). */
export const aiDescribeRules = (deps: RulesDependencies, call: ReadCall) =>
  readCall(deps, call, "describe_rules", {
    schema: describeRulesSchema,
    run: async () => ok(describeRules(deps.rules)),
    effect: (v) => `rules version ${v.version} (${v.revision})`,
  });

/** The dry check of a species name: nothing is written, the catalog is not searched (US-KI-13). */
export const aiCheckSpeciesName = (deps: RulesDependencies, call: ReadCall) =>
  readCall(deps, call, "check_species_name", {
    schema: checkSpeciesNameSchema,
    run: async (input) => ok(deps.rules.checkName(input.name)),
    effect: (v) => (v.valid ? "name valid" : `name refused (${v.code ?? "unknown"})`),
  });

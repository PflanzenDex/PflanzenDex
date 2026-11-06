// The catalog naming rule in words, with examples (US-KI-13): what a client must respect before it proposes a species.
// The words are built from the limits the check uses (LATIN_NAME_RULE) and the dry check runs the same field check as
// the proposal (`latinField`), so a client gets the same code without writing anything (FR-KI-17). The examples are
// proven by a test against the check; a rule that changes without its description fails there.
import { ERROR_TEXTS, type ErrorCode } from "../../../kernel";
import { latinField } from "./fields";
import { LATIN_NAME_RULE as R } from "./name";

/** An example of the rule: the name a client sends and what the check makes of it (a normal form or a code). */
export interface NameExample {
  readonly name: string;
  readonly normalized: string | null;
  readonly code: ErrorCode | null;
}

const valid = (name: string, normalized = name): NameExample => ({ name, normalized, code: null });
const refused = (name: string, code: ErrorCode): NameExample => ({ name, normalized: null, code });

const ADDITIONS = R.additions.map((a) => `${a}.`).join(", ");

/** The rule per aspect, in English for the client; each refusal names the code the proposal returns. */
const RULES = {
  form:
    "The catalog name (latinName) is the Latin name of a species: the genus, followed by the species epithet when " +
    "it is known; the genus alone is allowed.",
  words:
    `At most ${R.words} words of letters or hyphens, each ${R.word.min} to ${R.word.max} characters; no digits, ` +
    "dots or commas (input.invalid). The server writes the genus capitalized and the epithet in lower case.",
  cultivar:
    `A cultivar only in single quotes at the very end, ${R.cultivar.min} to ${R.cultivar.max} characters, at most ` +
    "one; it does not count as a word.",
  hybrid:
    `No hybrid sign (${R.hybridSigns.join(" ")}) as a word or glued to the genus (catalog.name_hybrid). Enter the ` +
    "species without it.",
  addition:
    `No infraspecific addition (${ADDITIONS}) (catalog.name_addition). It belongs to the specimen, not to the ` +
    "catalog.",
  placeholder:
    "No placeholder such as sp. or spp. (input.invalid). When only the genus is known, enter the genus alone.",
  duplicate:
    "A species that already exists by name or synonym is refused on proposal with species.duplicate and its id; " +
    "use search_species first. The dry check does not look into the catalog.",
} as const;

/** The naming rule of the catalog (DM-BES-01, US-POK-02) as the AI interface describes it. */
export const SPECIES_NAMING_RULE = {
  field: "latinName",
  rules: RULES,
  examples: [
    valid("Ficus benjamina"),
    valid("dracaena TRIFASCIATA", "Dracaena trifasciata"),
    valid("Dracaena trifasciata 'Moonshine'"),
    valid("Echeveria 'Perle von Nürnberg'"),
    valid("Sansevieria"),
    refused("Citrus x limon", "catalog.name_hybrid"),
    refused("×Chitalpa tashkentensis", "catalog.name_hybrid"),
    refused("Aloe vera var. chinensis", "catalog.name_addition"),
    refused("Monstera deliciosa cv. Thai", "catalog.name_addition"),
    refused("Aloe sp.", "input.invalid"),
    refused("Aloe vera Moonshine", "input.invalid"),
  ],
} as const;

/** The answer of the dry check: the normal form, or the code the proposal would return with its reason. */
export type SpeciesNameCheck =
  | {
      readonly valid: true;
      readonly name: string;
      readonly normalized: string;
      readonly genus: string;
      readonly epithet: string | null;
      readonly cultivar: string | null;
    }
  | {
      readonly valid: false;
      readonly name: string;
      readonly code: ErrorCode;
      /** The text the keeper sees for the code (German, UI text); translate by the code. */
      readonly reason: string;
      /** The aspects of the rule that apply, in English. */
      readonly rule: readonly string[];
    };

const RULE_OF: Partial<Record<ErrorCode, readonly string[]>> = {
  "catalog.name_hybrid": [RULES.hybrid],
  "catalog.name_addition": [RULES.addition],
};

/** Checks a name with the same field check as the proposal, without writing (US-KI-13). */
export function checkSpeciesName(name: string): SpeciesNameCheck {
  const r = latinField(name);
  if ("display" in r)
    return {
      valid: true,
      name,
      normalized: r.display,
      genus: r.genus,
      epithet: r.epithet,
      cultivar: r.cultivar,
    };
  const rule = RULE_OF[r.code] ?? [RULES.form, RULES.words, RULES.cultivar, RULES.placeholder];
  return { valid: false, name, code: r.code, reason: ERROR_TEXTS[r.code], rule };
}

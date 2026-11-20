// Tools of the rule discovery (US-KI-13): the rules a client respects before it writes, and a dry check of a species
// name. The input schemas come from the checks of the operations (FR-KI-17); only the descriptions are written here.
import { checkSpeciesNameSchema, describeRulesSchema } from "@pflanzendex/core";
import { query, type McpTool } from "../schema";
import { inputOf } from "./collection/collection-tools";

export const RULES_TOOLS: readonly McpTool[] = [
  {
    name: "describe_rules",
    title: "Validation and naming rules",
    description:
      "The rules to respect before writing, the same for every keeper: per area the input schema, class and right " +
      "of every tool, the catalog naming rule with examples, and every error code with its meaning. Versioned; " +
      "read it once per session instead of learning the rules from refusals.",
    operation: "describe_rules",
    inputSchema: inputOf(describeRulesSchema, {}),
    readOnly: true,
    request: () => ({ method: "GET", path: "/mcp/rules" }),
  },
  {
    name: "check_species_name",
    title: "Check a species name",
    description:
      "Checks a Latin name against the catalog naming rule without writing anything: returns the normal form, or " +
      "the code a species proposal would be refused with (catalog.name_hybrid, catalog.name_addition, " +
      "input.invalid) and the rule it violates. Does not search the catalog; use search_species for that.",
    operation: "check_species_name",
    inputSchema: inputOf(checkSpeciesNameSchema, {
      name: "The Latin name to check, e.g. 'Ficus benjamina' or 'Dracaena trifasciata 'Moonshine''.",
    }),
    readOnly: true,
    request: (a) => ({ method: "GET", path: query("/mcp/rules/species-name", a, ["name"]) }),
  },
];

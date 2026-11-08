import type { Sibling } from "../../markers/marker/marker-rule";
import type { CreateFields } from "./schemas";

/**
 * The create fields as they start (US-BES-03): the marker preset when the rule requires one, the answers empty, everything
 * else unknown or empty (P-08). The long and the short form start from the same values. Kept out of `schemas` (zod), so
 * the marker of a further plant takes it without the schema module (issue 1638).
 */
export const createStart = (
  rule: { required: boolean; missing: readonly Sibling[]; preset: string },
  today: string,
): CreateFields => ({
  marker: rule.required ? rule.preset : "",
  answers: Object.fromEntries(rule.missing.map((s) => [s.id, ""])),
  cutting: false,
  locationId: "",
  lightZoneId: "",
  catchDate: today,
});

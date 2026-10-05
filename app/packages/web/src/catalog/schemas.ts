import { z } from "zod";
import { errorText } from "@/lib/error-text";
import type { ApiError } from "../kernel";

const LUX_MAX = 200000;
const required = (message: string) => z.string().trim().min(1, message);
const optional = z.string().trim();
const monthDay = optional.refine(
  (v) => v === "" || /^\d\d-\d\d$/.test(v),
  "Bitte gib Monat und Tag als MM-TT an, z. B. 11-15.",
);

/**
 * The form "Propose species" (FR-BES-05, DM-BES-01, DS-47): fast feedback per field in German. The server operation
 * validates again (P-03). Empty optional fields stay unknown instead of guessed (P-08).
 */
export const proposalSchema = z
  .object({
    latinName: required("Bitte gib den lateinischen Namen an."),
    difficulty: required("Bitte wähle die Schwierigkeit."),
    standardLevel: required("Bitte wähle die Standard-Stufe."),
    lightDemandLux: optional
      .refine((v) => v !== "", "Bitte gib den Lichtbedarf in Lux an.")
      .refine(
        (v) => v === "" || (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= LUX_MAX),
        "Bitte gib den Lichtbedarf als ganze Zahl zwischen 1 und 200.000 Lux an.",
      ),
    growthMeasure: required("Bitte wähle das Wachstumsmaß."),
    etiolationSigns: required("Bitte beschreibe die Vergeilung-Anzeichen."),
    successCriteria: required("Bitte beschreibe die Erfolgskriterien."),
    germanName: optional,
    englishName: optional,
    familyGerman: optional,
    familyLatin: optional,
    locationHint: optional,
    wateringHint: optional,
    substrate: optional,
    pruning: optional,
    growthHacks: optional,
    source: optional,
    dormancyFrom: monthDay,
    dormancyUntil: monthDay,
    synonyms: optional,
    botanicalStory: optional,
  })
  .superRefine((f, ctx) => {
    const missing = (path: "dormancyFrom" | "dormancyUntil", message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    if (f.dormancyFrom !== "" && f.dormancyUntil === "")
      missing(
        "dormancyUntil",
        "Beide Angaben zur Ruhephase gehören zusammen: Bitte gib auch das Ende an.",
      );
    if (f.dormancyFrom === "" && f.dormancyUntil !== "")
      missing(
        "dormancyFrom",
        "Beide Angaben zur Ruhephase gehören zusammen: Bitte gib auch den Beginn an.",
      );
  });

export type ProposalFields = z.infer<typeof proposalSchema>;

export const EMPTY_PROPOSAL: ProposalFields = {
  latinName: "",
  difficulty: "",
  standardLevel: "",
  lightDemandLux: "",
  growthMeasure: "",
  etiolationSigns: "",
  successCriteria: "",
  germanName: "",
  englishName: "",
  familyGerman: "",
  familyLatin: "",
  locationHint: "",
  wateringHint: "",
  substrate: "",
  pruning: "",
  growthHacks: "",
  source: "",
  dormancyFrom: "",
  dormancyUntil: "",
  synonyms: "",
  botanicalStory: "",
};

const NUMBERS = ["difficulty", "standardLevel", "lightDemandLux"];

/** The API input of a checked form: empty fields stay out (unknown), numbers are numbers, synonyms one per line. */
export function toProposalInput(f: ProposalFields): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const [name, raw] of Object.entries(f)) {
    const text = raw.trim();
    if (text === "") continue;
    if (name === "synonyms")
      input[name] = text
        .split(/\n/)
        .map((z) => z.trim())
        .filter(Boolean);
    else input[name] = NUMBERS.includes(name) ? Number(text) : text;
  }
  return input;
}

/**
 * The fields a refusal points at with the German text of their own error code: the field names in its details, for a
 * duplicate the Latin name. Empty when the refusal names no field of the form (then it stays in the alert, P-10).
 */
export function refusedFields(
  error: Pick<ApiError, "code" | "details">,
): { field: keyof ProposalFields; message: string }[] {
  const named = (error.details ?? []).filter((d) => d.field in EMPTY_PROPOSAL);
  if (named.length > 0)
    return named.map((d) => ({
      field: d.field as keyof ProposalFields,
      message: errorText(d.code),
    }));
  return error.code === "species.duplicate"
    ? [{ field: "latinName", message: errorText(error.code) }]
    : [];
}

/** The catalog search field (DS-47): the text is limited like the server limits it; searching itself never fails. */
export const searchSchema = z.object({
  search: z.string().max(120, "Der Suchtext darf höchstens 120 Zeichen lang sein."),
});

export type SearchFields = z.infer<typeof searchSchema>;

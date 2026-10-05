import { z } from "zod";
import type { Sibling } from "./marker-fields";

/** Fast client feedback in German (DS-47, DS-49); the server operation validates again (P-03). */
export const MARKER_MISSING =
  "Bitte gib ein Kennzeichen an, damit du die Töpfe dieser Art unterscheiden kannst.";
export const MARKERS_MISSING =
  "Bitte vergib zuerst alle fehlenden Kennzeichen, bevor du speicherst.";
export const REASON_MISSING =
  "Bitte nenne einen Grund, damit du später noch weißt, warum das Exemplar im Archiv ist.";

/** The create form (US-BES-02, US-BES-03, US-BES-04, FR-BES-04): all fields hold text, an empty text means unknown. */
export const createSchema = (rule: { required: boolean; missing: readonly Sibling[] }) =>
  z
    .object({
      marker: z.string(),
      /** The markers of existing specimens that still have none, by specimen id (from the 3rd specimen on). */
      answers: z.record(z.string(), z.string()),
      cutting: z.boolean(),
      locationId: z.string(),
      catchDate: z.string(),
    })
    .superRefine((f, ctx) => {
      if (rule.required && f.marker.trim() === "")
        ctx.addIssue({ code: "custom", path: ["marker"], message: MARKER_MISSING });
      for (const s of rule.missing)
        if ((f.answers[s.id] ?? "").trim() === "")
          ctx.addIssue({ code: "custom", path: ["answers", s.id], message: MARKERS_MISSING });
    });
export type CreateFields = z.infer<ReturnType<typeof createSchema>>;

/** The form to give a specimen a marker or change it (US-BES-03). */
export const markerSchema = z.object({
  marker: z.string().trim().min(1, MARKER_MISSING),
});
export type MarkerFields = z.infer<typeof markerSchema>;

export const OTHER_REASON = "other";

/** The form to archive a specimen (US-BES-07): a reason from the list, or an own one. */
export const archiveSchema = z
  .object({ choice: z.string(), free: z.string() })
  .superRefine((f, ctx) => {
    if (f.choice === OTHER_REASON && f.free.trim() === "")
      ctx.addIssue({ code: "custom", path: ["free"], message: REASON_MISSING });
  });
export type ArchiveFields = z.infer<typeof archiveSchema>;

/** The reason that is sent: the chosen one, or the own text. */
export const reasonOf = (f: ArchiveFields): string =>
  f.choice === OTHER_REASON ? f.free.trim() : f.choice;

/** What the fields of the care profile hold; an empty text means "no deviation" (US-BES-09). */
export const careProfileSchema = z.object({
  growthLocationId: z.string(),
  dormancyLocationId: z.string(),
  lightZoneId: z.string(),
  fromMonth: z.string(),
  fromDay: z.string(),
  untilMonth: z.string(),
  untilDay: z.string(),
  wateringGrowthDays: z.string(),
  wateringDormancyDays: z.string(),
  ownHints: z.string(),
});
export type CareProfileFields = z.infer<typeof careProfileSchema>;

import {
  INVITATION_VALIDITY_DAYS,
  OPERATOR_COST_CENTS,
  REPLENISH_BUFFER_LIMITS as BUFFER,
} from "@pflanzendex/core";
import { z } from "zod";
import { OCCASIONS, type AccountProfile } from "./api/account-api";

/** The fields of the settings form (US-ACC-02, DS-47): texts stay texts, the server operation decides (P-03). */
export const profileSchema = z.object({
  displayName: z.string(),
  timeZone: z.string(),
  everythingPrivate: z.boolean(),
  noRecommendations: z.boolean(),
  /** Whole number as text; the server decides again (P-03). */
  replenishBuffer: z.string().refine((text) => {
    const n = Number(text);
    return /^\d+$/.test(text.trim()) && n >= BUFFER.min && n <= BUFFER.max;
  }, `Gib eine ganze Zahl von ${BUFFER.min} bis ${BUFFER.max} ein.`),
  notifications: z.object({
    phase: z.boolean(),
    treatment: z.boolean(),
    measurement: z.boolean(),
    watering: z.boolean(),
    swap: z.boolean(),
    friends: z.boolean(),
  }),
});
export type ProfileFields = z.infer<typeof profileSchema>;

/** Every occasion has a switch: a new occasion without a field in the schema fails the typecheck here. */
OCCASIONS satisfies readonly (keyof ProfileFields["notifications"])[];

export const toProfileFields = (p: AccountProfile, deviceZone: string | null): ProfileFields => ({
  displayName: p.displayName ?? "",
  timeZone: p.timeZone ?? deviceZone ?? "",
  everythingPrivate: p.everythingPrivate,
  noRecommendations: p.noRecommendations,
  replenishBuffer: String(p.replenishBuffer),
  notifications: { ...p.notifications },
});

/**
 * The profile to save. An untouched empty name stays "none"; a cleared one is sent as empty text, so the server
 * refuses it and names the field. An empty zone means none.
 */
export function toProfile(f: ProfileFields, saved: AccountProfile): AccountProfile {
  return {
    ...saved,
    displayName: f.displayName === "" && saved.displayName === null ? null : f.displayName,
    timeZone: f.timeZone === "" ? null : f.timeZone,
    everythingPrivate: f.everythingPrivate,
    noRecommendations: f.noRecommendations,
    replenishBuffer: Number(f.replenishBuffer.trim()),
    notifications: { ...f.notifications },
  };
}

/** Fields of the settings form a server refusal can point at, in the order of the form. */
export const PROFILE_REFUSABLE = ["displayName", "timeZone", "replenishBuffer"] as const;

export const invitationCodeSchema = z.object({
  code: z.string().trim().min(1, "Bitte gib deinen Einladungscode ein."),
});
export type InvitationCodeFields = z.infer<typeof invitationCodeSchema>;

/** Limits of the validity in days, as the server enforces them (INVITATION_VALIDITY_DAYS). */
export const DAYS = INVITATION_VALIDITY_DAYS;

export const invitationDaysSchema = z.object({
  days: z.string().refine((text) => {
    const n = Number(text);
    return text.trim() !== "" && Number.isInteger(n) && n >= DAYS.min && n <= DAYS.max;
  }, `Gib eine ganze Zahl zwischen ${DAYS.min} und ${DAYS.max} ein.`),
});
export type InvitationDaysFields = z.infer<typeof invitationDaysSchema>;

/**
 * `12,50`, `1.234,5` or `1234.50` in cents; `null` if it is no amount with at most two decimals. A comma is the
 * decimal separator if present (dots are then thousands separators), otherwise a dot is.
 */
export function parseAmount(text: string): number | null {
  const t = text.trim().replace(/\s/g, "");
  const plain = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const [whole = "", part = "", ...rest] = plain.split(".");
  if (rest.length > 0 || !/^\d+$/.test(whole) || !/^\d{0,2}$/.test(part)) return null;
  if (plain.endsWith(".")) return null;
  const cents = Number(whole) * 100 + Number(part.padEnd(2, "0"));
  return cents <= OPERATOR_COST_CENTS.max ? cents : null;
}

export const costSchema = z.object({
  amount: z
    .string()
    .refine(
      (a) => parseAmount(a) !== null,
      "Gib einen Betrag bis 1.000.000 mit höchstens zwei Nachkommastellen ein, zum Beispiel 12,50.",
    ),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/, "Gib die Währung mit drei Buchstaben an, zum Beispiel EUR."),
  month: z.string().regex(/^\d{4}-\d{2}$/, "Wähle den Monat, zu dem die Kosten gehören."),
});
export type CostFields = z.infer<typeof costSchema>;

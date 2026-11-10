import type { PlanPot } from "@pflanzendex/core";
import { withUnit } from "@/shared/lib/format";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "../repot.de.json";

const t = texts(table);

/** The size of a pot: "12 cm", or "Größe unbekannt" while the diameter is unknown (P-08). */
export const potSizeText = (pot: PlanPot): string =>
  pot.diameterCm === null ? t("pot.sizeUnknown") : withUnit(pot.diameterCm, "cm");

/** A free pot in a list or a choice: "Name · 12 cm" (US-BES-19). */
export const potItemText = (pot: PlanPot): string =>
  t("pot.item", { name: pot.name, size: potSizeText(pot) });

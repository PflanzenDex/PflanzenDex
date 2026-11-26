import { Link } from "react-router";
import { PATHS } from "@/shared/patterns/navigation/navigation/navigation";
import { texts } from "@/shared/lib/text-rules/texts";
import type { AchievementItem } from "../../achievements-api";
import { ACHIEVEMENT_NAMES, MISSING_TEXTS, germanDate, nextStepText } from "../texts";
import table from "../overview.de.json";

const t = texts(table);

const CARD = "flex min-w-0 flex-col gap-0.5 rounded-card bg-card p-4 shadow-elevation-1";

function Earned({ item }: { item: AchievementItem }) {
  return (
    <div className={CARD}>
      <p className="m-0 font-semibold">
        {ACHIEVEMENT_NAMES[item.id] ?? item.id}
        {item.isNew && <span className="ml-2 text-sm font-normal">{t("card.new")}</span>}
      </p>
      <p className="m-0 text-sm text-muted-foreground">
        {t("card.earnedOn", {
          date: item.earnedOn ? germanDate(item.earnedOn) : t("card.unknown"),
        })}
        {item.specimenName && (
          <>
            {" "}
            {t("card.with")}{" "}
            <Link to={PATHS.collection} className="underline">
              {item.specimenName}
            </Link>
          </>
        )}
      </p>
    </div>
  );
}

function Open({ item }: { item: AchievementItem }) {
  const step = item.nextStep;
  return (
    <div className={CARD}>
      <p className="m-0 font-semibold">{ACHIEVEMENT_NAMES[item.id] ?? item.id}</p>
      {step && (
        <p className="m-0 text-sm">
          {t("card.nextStep", { step: nextStepText(step.key, step.specimenName) })}
        </p>
      )}
      {item.missing && (
        <p className="m-0 text-sm text-muted-foreground">
          {MISSING_TEXTS[item.missing] ?? t("card.missingFallback")}
        </p>
      )}
    </div>
  );
}

/** The cards of each state: earned newest first, open in the order of the definitions (US-ACH-02). */
export const CARDS = { earned: Earned, open: Open };

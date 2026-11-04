import type { ReviewEntry } from "@pflanzendex/core";
import type { ReactNode } from "react";
import { texts } from "@/shared/lib/text-rules/texts";
import { Badge } from "@/shared/ui/display/badge/badge";
import { ageText, issueText } from "../../review-text";
import {
  growthText,
  difficultyText,
  dormancyPhase,
  levelText,
  lux,
  orUnknown,
} from "../../../shared/text";
import table from "./layer-facts.de.json";

const t = texts(table);

/**
 * One label and its value. Beside each other the label takes the room it needs and the value the rest; in a box narrower
 * than 12 rem (a container query in rem, so it follows the text size) the label stands above its value. At 200 % text the
 * label alone was wider than the box and pushed the value out of it (issue 1229, the rule of FactGrid, issue 1180).
 */
function Row(props: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 @min-[12rem]:contents">
      <dt>{props.label}</dt>
      <dd>{props.children}</dd>
    </div>
  );
}

function Facts(props: { entry: ReviewEntry }) {
  const s = props.entry.species;
  if (!s) return <p className="text-sm text-muted-foreground">{t("facts.unavailable")}</p>;
  return (
    <dl className="m-0 grid grid-cols-1 gap-x-4 gap-y-3 [overflow-wrap:anywhere] @min-[12rem]:grid-cols-[auto_minmax(0,1fr)] @min-[12rem]:gap-y-1 [&_dd]:m-0 [&_dt]:text-muted-foreground">
      <Row label={t("label.difficulty")}>{difficultyText(s.difficulty)}</Row>
      <Row label={t("label.standardLevel")}>{levelText(s.standardLevel)}</Row>
      <Row label={t("label.light")}>{lux(s.lightDemandLux)}</Row>
      <Row label={t("label.dormancy")}>{dormancyPhase(s)}</Row>
      <Row label={t("label.growth")}>{growthText(s.growthMeasure)}</Row>
      <Row label={t("label.etiolation")}>{orUnknown(s.etiolationSigns)}</Row>
      <Row label={t("label.success")}>{orUnknown(s.successCriteria)}</Row>
      <Row label={t("label.source")}>{orUnknown(s.source)}</Row>
    </dl>
  );
}

/**
 * The facts tab of a case (US-BES-10): the age, the AI marking, the fields in two columns, and why approval is not
 * possible yet. An operator batch has no missing fields to show.
 */
export function LayerFacts(props: { entry: ReviewEntry; now: number }) {
  const { entry, now } = props;
  const batch = entry.reviewCase.status === "curated";
  const blocked = entry.issues.length > 0;
  return (
    <div className="@container flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {batch ? t("status.batch") : t("status.proposal")} ·{" "}
        {ageText(entry.reviewCase.createdAt, now)}
      </p>
      {entry.aiCreated && (
        <Badge variant="warning" className="self-start whitespace-normal">
          {t("status.aiCreated")}
        </Badge>
      )}
      <Facts entry={entry} />
      {!batch && blocked && (
        <div
          id={`issues-${entry.reviewCase.id}`}
          className="rounded-lg border border-warning-border bg-warning p-3 text-warning-foreground"
        >
          <p>{t("blocked", { issues: entry.issues.map(issueText).join("; ") })}</p>
        </div>
      )}
    </div>
  );
}

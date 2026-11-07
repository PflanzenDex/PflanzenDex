import { Link } from "react-router";
import {
  GENERAL_STARTING_VALUE,
  REPOT_INTERVAL_STARTING_MONTHS,
  type PlanPot,
  type RepotHint,
  type RepotPlan,
  type SpecimenCard,
} from "@pflanzendex/core";
import { useRequest } from "@/shared/data";
import { dateText } from "@/shared/lib/format";
import { refusalText } from "@/shared/lib/error-text";
import { texts } from "@/shared/lib/text-rules/texts";
import { PATHS } from "@/shared/patterns/navigation/navigation/navigation";
import { Button } from "@/shared/ui/button/button";
import type { PhotoAccess } from "@/shared/platform/browser/use-stored-photo";
import { Quiet, Warning } from "../../../specimens/cards/parts/parts";
import { loadRepotPlan, REPOT_PLAN_KEY, type RepotPlanView } from "../repot-api";
import { Observations, signLabel } from "./observations/observations";
import { potItemText, potSizeText } from "./pot-text";
import table from "../repot.de.json";

const t = texts(table);

/** The mode "Geräte" of the Sammlung, where the keeper adds a pot (US-BES-19, US-EQU-01). */
const EQUIPMENT_MODE_ADDRESS = `${PATHS.collection}?view=equipment`;

/**
 * The section "Umtopfen" of a plant (US-BES-19, FR-BES-27): the last repot, the repot hints with their reason and source,
 * the season, the current pot, the free pots and the three observations. The plan is read when the tab opens and derived
 * by the API on every read (P-01). While the keeper switch for the repot planner is off the section is not shown at all.
 */
export function RepotPlanSection(props: {
  card: SpecimenCard;
  access: PhotoAccess;
  onRepot: () => void;
}) {
  const { card, access } = props;
  const plan = useRequest<RepotPlanView>({
    queryKey: REPOT_PLAN_KEY(card.id),
    token: access.token,
    load: (token) => loadRepotPlan(access.api, token, card.id),
    fresh: true,
  });
  const headingId = `repot-plan-${card.id}`;
  if (plan.status === "pending")
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t("plan.loading")}
      </p>
    );
  if (plan.status === "error")
    return (
      <section aria-labelledby={headingId} className="grid gap-2">
        <h3 id={headingId} className="font-semibold">
          {t("plan.title")}
        </h3>
        <Warning>
          <p>{t("plan.failed")}</p>
          {plan.error ? <p>{refusalText(plan.error)}</p> : null}
          <Button type="button" variant="outline" onClick={plan.retry}>
            {t("plan.retry")}
          </Button>
        </Warning>
      </section>
    );
  const view = plan.value;
  if (view === undefined || view.hidden) return null;
  return (
    <section aria-labelledby={headingId} className="grid gap-3 text-sm">
      <h3 id={headingId} className="font-semibold">
        {t("plan.title")}
      </h3>
      <p>
        {view.lastRepot === null
          ? t("plan.lastUnknown")
          : t("plan.lastKnown", { date: dateText(view.lastRepot) })}
      </p>
      <HintList hints={view.hints} season={view.seasonAdvice} />
      <CurrentPot pot={view.currentPot} />
      {view.equipmentOff ? null : <FreePots pots={view.freePots} />}
      <Observations access={access} id={card.id} hints={view.hints} reload={plan.retry} />
      <Button type="button" variant="outline" size="touch" onClick={props.onRepot}>
        {t("plan.repot")}
      </Button>
    </section>
  );
}

/** The hints of the plan, or "Gerade kein Grund zum Umtopfen." (P-09); the season advice follows the hints. */
function HintList(props: { hints: readonly RepotHint[]; season: RepotPlan["seasonAdvice"] }) {
  if (props.hints.length === 0) return <Quiet>{t("plan.none")}</Quiet>;
  return (
    <div className="grid gap-1">
      <ul aria-label={t("plan.hints")} className="m-0 grid list-none gap-2 p-0">
        {props.hints.map((hint) => (
          <li key={hint.reason} className="grid gap-0.5">
            <HintText hint={hint} />
          </li>
        ))}
      </ul>
      {props.season === "spring" ? <p>{t("season.spring")}</p> : null}
      {props.season === "phase_unknown" ? <p>{t("season.unknown")}</p> : null}
    </div>
  );
}

/** One hint: the time hint names how long ago and its source; an observation names itself and its day (P-08). */
function HintText({ hint }: { hint: RepotHint }) {
  if (hint.reason !== "interval")
    return (
      <span>
        {t("hint.sign", { label: signLabel(hint.reason), date: dateText(hint.tickedOn) })}
      </span>
    );
  return (
    <>
      <span>
        {hint.monthsAgo === 1
          ? t("plan.intervalOne", { months: hint.monthsAgo })
          : t("plan.intervalOther", { months: hint.monthsAgo })}
      </span>
      <Quiet>
        {hint.source === GENERAL_STARTING_VALUE
          ? t("plan.general", { months: REPOT_INTERVAL_STARTING_MONTHS })
          : t("plan.source", { source: hint.source })}
      </Quiet>
    </>
  );
}

/** The pot the plant sits in; without a recorded pot the line says so (P-08). */
function CurrentPot(props: { pot: PlanPot | null }) {
  const { pot } = props;
  if (pot === null) return <p>{t("pot.currentNone")}</p>;
  return (
    <p>
      {pot.diameterCm === null
        ? t("pot.currentUnknownSize", { name: pot.name })
        : t("pot.current", { name: pot.name, size: potSizeText(pot) })}
    </p>
  );
}

/** The free pots in the order the API gives; none free says so and links to the equipment (P-09). */
function FreePots(props: { pots: readonly PlanPot[] }) {
  return (
    <div className="grid gap-1">
      <h4 className="font-semibold">{t("free.heading")}</h4>
      {props.pots.length === 0 ? (
        <>
          <p>{t("free.none")}</p>
          <Link
            to={EQUIPMENT_MODE_ADDRESS}
            className="inline-flex min-h-[44px] items-center underline"
          >
            {t("free.link")}
          </Link>
        </>
      ) : (
        <ul aria-label={t("free.heading")} className="m-0 grid list-none gap-1 p-0">
          {props.pots.map((pot) => (
            <li key={pot.id}>{potItemText(pot)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

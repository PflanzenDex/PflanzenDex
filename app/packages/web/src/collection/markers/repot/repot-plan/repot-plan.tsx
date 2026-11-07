import { Link } from "react-router";
import {
  GENERAL_STARTING_VALUE,
  REPOT_INTERVAL_STARTING_MONTHS,
  type PlanPot,
  type RepotHint,
  type RepotPlan,
  type SpecimenCard,
} from "@pflanzendex/core";
import { useRequest, type Request } from "@/shared/data";
import { dateText } from "@/shared/lib/format";
import { refusalText } from "@/shared/lib/error-text";
import { texts } from "@/shared/lib/text-rules/texts";
import { PATHS } from "@/shared/patterns/navigation/navigation/navigation";
import { LayerOpener } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { Button } from "@/shared/ui/button/button";
import type { PhotoAccess } from "@/shared/platform/browser/use-stored-photo";
import { Quiet, Warning } from "../../../specimens/cards/parts/parts";
import { loadRepotPlan, REPOT_PLAN_KEY, type RepotPlanView } from "../repot-api";
import { signLabel } from "./observations/observations";
import { potItemText, potSizeText } from "./pot-text";
import table from "../repot.de.json";

const t = texts(table);

/** The mode "Geräte" of the Sammlung, where the keeper adds a pot (US-BES-19, US-EQU-01). */
const EQUIPMENT_MODE_ADDRESS = `${PATHS.collection}?view=equipment`;

/** The id of the layer "Beobachtungen" of a plant in the address (US-BES-19, like `profil-<id>` and `notes-<id>`). */
export const signsLayerId = (specimenId: string): string => `signs-${specimenId}`;

/** No token while no access is given: a cutting has no repot part, so its plan is never read (US-BES-04). */
const noToken = async () => undefined;

/**
 * The repot plan of a plant (US-BES-19): it is read only while the plant has the repot part or its layer is open
 * (`access` given), and it is read again on every opening (`fresh`), so the hints follow the last write.
 */
export function useRepotPlan(
  card: SpecimenCard,
  access: PhotoAccess | undefined,
): Request<RepotPlanView> {
  return useRequest<RepotPlanView>({
    queryKey: REPOT_PLAN_KEY(card.id),
    token: access?.token ?? noToken,
    load: (token) => loadRepotPlan(access?.api ?? "", token, card.id),
    fresh: true,
    enabled: access !== undefined,
  });
}

/**
 * The part "Umtopfen" of a plant (US-BES-19, FR-BES-27): the last repot, the current pot, the repot hints with their reason
 * and source, the season, the free pots, the observations in one line, and the two actions in one row. The observations
 * are ticked in their own layer (`signsLayerId`), so the part stays short on a phone (issue 1328). The part is named by its
 * segment, so the section is a labelled region without a second heading.
 */
export function RepotPlanSection(props: {
  card: SpecimenCard;
  plan: Request<RepotPlanView>;
  onRepot: () => void;
}) {
  const { card, plan } = props;
  if (plan.status === "pending")
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t("plan.loading")}
      </p>
    );
  if (plan.status === "error")
    return (
      <section aria-label={t("plan.title")} className="grid gap-2">
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
    <section aria-label={t("plan.title")} className="grid gap-2 text-sm">
      <div>
        <p>
          {view.lastRepot === null
            ? t("plan.lastUnknown")
            : t("plan.lastKnown", { date: dateText(view.lastRepot) })}
        </p>
        <CurrentPot pot={view.currentPot} />
      </div>
      <HintList hints={view.hints} season={view.seasonAdvice} />
      {view.equipmentOff ? null : <FreePots pots={view.freePots} />}
      <SignsLine hints={view.hints} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={props.onRepot}>
          {t("plan.repot")}
        </Button>
        <LayerOpener id={signsLayerId(card.id)}>{t("plan.signsOpen")}</LayerOpener>
      </div>
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

/**
 * The free pots in the order the API gives. With none, one line says so and links to the equipment, on the same line
 * (P-09); with pots, they are listed (US-BES-19).
 */
function FreePots(props: { pots: readonly PlanPot[] }) {
  if (props.pots.length === 0)
    return (
      <div className="flex flex-wrap items-center gap-x-2">
        <p>{t("free.none")}</p>
        <Link
          to={EQUIPMENT_MODE_ADDRESS}
          className="inline-flex min-h-[44px] items-center underline"
        >
          {t("free.link")}
        </Link>
      </div>
    );
  return (
    <div className="grid gap-1">
      <h4 className="font-semibold">{t("free.heading")}</h4>
      <ul aria-label={t("free.heading")} className="m-0 grid list-none gap-1 p-0">
        {props.pots.map((pot) => (
          <li key={pot.id}>{potItemText(pot)}</li>
        ))}
      </ul>
    </div>
  );
}

/** The ticked observations on one line: "Beobachtungen: keine" or their names (US-BES-19, DM-BES-09). */
function SignsLine(props: { hints: readonly RepotHint[] }) {
  const names = props.hints.flatMap((h) => (h.reason === "interval" ? [] : [signLabel(h.reason)]));
  return (
    <p>
      {names.length === 0 ? t("plan.signsNone") : t("plan.signsList", { list: names.join(", ") })}
    </p>
  );
}

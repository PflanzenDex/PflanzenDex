import type { IntroductionFigure, IntroductionFigures } from "@pflanzendex/core";
import { useCallback, type ReactNode } from "react";
import { Check, X } from "lucide-react";
import { LoadFrame } from "@/shared/patterns/states/request-state/load-frame/load-frame";
import { loadIntroduction } from "../../api/access-api";
import { MoreHelp } from "@/shared/ui/more-help";
import { GroupedList, GroupedRow } from "@/shared/lists/grouped-list/grouped-list";
import { keepTogether, withUnit } from "@/shared/lib/format";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "./introduction-section.de.json";

const t = texts(table);

type Token = () => Promise<string | undefined>;

/** A duration: seconds below a minute, minutes and seconds from 60 s on: "6 min 19 s" for 379 s (US-QS-32). */
function duration(value: number): string {
  // Whole seconds first, so a fractional median reads as the seconds the keeper sees (379.5 s is "6 min 20 s").
  const seconds = Math.round(value);
  if (seconds < 60) return withUnit(seconds, t("unit.second"));
  const minutes = withUnit(Math.floor(seconds / 60), t("unit.minute"));
  const rest = seconds % 60;
  return rest === 0 ? minutes : `${minutes} ${withUnit(rest, t("unit.second"))}`;
}

/** The verdict as a mark and words, so it is not carried by colour alone (SG-COLOR-05). */
function Verdict(props: { met: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      {props.met ? (
        <Check aria-hidden="true" className="size-4 shrink-0" />
      ) : (
        <X aria-hidden="true" className="size-4 shrink-0" />
      )}
      {t(props.met ? "figure.met" : "figure.notMet")}
    </span>
  );
}

/** The target and the verdict of a figure: "Ziel: höchstens 90 s · erreicht"; an unknown figure keeps its target (P-08). */
function targetLine(target: string, met: boolean | null): ReactNode {
  const goal = t("figure.target", { target });
  if (met === null) return goal;
  return (
    <>
      {goal}
      {" · "}
      <Verdict met={met} />
    </>
  );
}

/**
 * One figure as a row: its name, its one emphasised value (or "unbekannt (zu wenige Konten)" while too few accounts
 * exist), and its target with the verdict in the meta line.
 */
function Figure(props: {
  title: string;
  figure: IntroductionFigure;
  format: (n: number) => string;
  target: string;
}) {
  const { figure } = props;
  return (
    <GroupedRow
      title={props.title}
      trailing={
        <span className="font-semibold tabular-nums">
          {figure.known ? props.format(figure.value) : t("figure.unknown")}
        </span>
      }
      meta={targetLine(props.target, figure.known ? figure.targetMet : null)}
    />
  );
}

function Figures(props: { figures: IntroductionFigures }) {
  const f = props.figures;
  const secondsTarget = t("target.limit", { value: withUnit(90, t("unit.second")) });
  const percentTarget = t("target.limit", { value: withUnit(25, t("unit.percent")) });
  return (
    <>
      <GroupedList>
        <Figure
          title="Mediane Zeit bis zur ersten Pflanze"
          figure={f.medianSecondsToFirstPlant}
          format={duration}
          target={secondsTarget}
        />
        <Figure
          title={`Konten ohne Pflanze nach ${f.settleDays} Tagen`}
          figure={f.withoutPlantPercent}
          format={(n) => withUnit(n, t("unit.percent"))}
          target={percentTarget}
        />
        <GroupedRow
          title="Schritte bis zur ersten Pflanze"
          trailing={<span className="font-semibold tabular-nums">{f.steps.value}</span>}
          // The steps keep their line as it was ("Ziel: höchstens 3 · erreicht"): this file holds its literal
          // count in the ui-text ratchet (FR-QG-26) until its texts move to the table.
          meta={
            <span className="inline-flex items-center gap-1">
              {f.steps.targetMet ? (
                <Check aria-hidden="true" className="size-4 shrink-0" />
              ) : (
                <X aria-hidden="true" className="size-4 shrink-0" />
              )}
              {`Ziel: höchstens 3 · ${t(f.steps.targetMet ? "figure.met" : "figure.notMet")}`}
            </span>
          }
        />
      </GroupedList>
      <MoreHelp
        className="mt-3"
        more={keepTogether(
          `Die Zeit läuft von der Anlage des Kontos bis zur Anlage der ersten Pflanze, nicht ab dem ersten Öffnen. Eine Zahl erscheint erst ab ${f.minAccounts} Konten; es wird kein einzelnes Konto und kein Klick erfasst. Die Schritte ergeben sich aus dem Aufbau des Einstiegs.`,
        )}
      >
        {keepTogether(
          `Gezählt werden Konten der letzten ${f.windowDays} Tage (${f.accounts ?? `unbekannt, weniger als ${f.minAccounts}`}).`,
        )}
      </MoreHelp>
    </>
  );
}

/**
 * The figures of the introduction for the operator (US-ONB-08), in the layer "Einstieg": derived from existing creation
 * dates only, aggregated, unknown below a minimum of accounts. A failure to load stays visible as text (P-10) and
 * blocks nothing else. The layer gives the heading.
 */
export function IntroductionSection(props: { api: string; token: Token }) {
  const { api, token } = props;
  const load = useCallback((t: string) => loadIntroduction(api, t), [api]);
  return (
    <section aria-label="Einstieg" className="@container flex flex-col gap-3">
      <LoadFrame
        queryKey={["account", "operator", "introduction"]}
        token={token}
        load={load}
        loadingText="Einstiegszahlen werden geladen …"
        loadingStatus={<p role="status">Einstiegszahlen werden geladen …</p>}
      >
        {(figures: IntroductionFigures) => <Figures figures={figures} />}
      </LoadFrame>
    </section>
  );
}

import type { IntroductionFigure, IntroductionFigures } from "@pflanzendex/core";
import { useCallback } from "react";
import { LoadFrame } from "../../../kernel";
import { loadIntroduction } from "../../api/access-api";
import { keepTogether } from "@/lib/format";

type Token = () => Promise<string | undefined>;

/** A figure with its target as plain text; an unknown one says why (P-08), the target stays visible. */
function figureText(f: IntroductionFigure, unit: (n: number) => string, target: string): string {
  if (!f.known) return `unbekannt (zu wenige Konten) · Ziel: ${target}`;
  return `${unit(f.value)} · Ziel: ${target} · ${f.targetMet ? "erreicht" : "nicht erreicht"}`;
}

const seconds = (n: number) => `${n} Sekunden`;
const percent = (n: number) => `${n} Prozent`;

function Figures(props: { figures: IntroductionFigures }) {
  const f = props.figures;
  return (
    <>
      <dl className="m-0 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
        <dt className="text-sm text-muted-foreground sm:text-base">
          Mediane Zeit bis zur ersten Pflanze
        </dt>
        <dd className="m-0 mb-2 font-semibold sm:mb-0">
          {figureText(f.medianSecondsToFirstPlant, seconds, "höchstens 90 Sekunden")}
        </dd>
        <dt className="text-sm text-muted-foreground sm:text-base">
          {`Konten ohne Pflanze nach ${f.settleDays} Tagen`}
        </dt>
        <dd className="m-0 mb-2 font-semibold sm:mb-0">
          {figureText(f.withoutPlantPercent, percent, "höchstens 25 Prozent")}
        </dd>
        <dt className="text-sm text-muted-foreground sm:text-base">
          Schritte bis zur ersten Pflanze
        </dt>
        <dd className="m-0 font-semibold">
          {`${f.steps.value} · Ziel: höchstens 3 · ${f.steps.targetMet ? "erreicht" : "nicht erreicht"}`}
        </dd>
      </dl>
      <p className="mt-3 text-sm text-muted-foreground">
        {keepTogether(
          `Gezählt werden Konten der letzten ${f.windowDays} Tage (${f.accounts ?? `unbekannt, weniger als ${f.minAccounts}`}). Die Zeit läuft von der Anlage des Kontos bis zur Anlage der ersten Pflanze, nicht ab dem ersten Öffnen. Eine Zahl erscheint erst ab ${f.minAccounts} Konten; es wird kein einzelnes Konto und kein Klick erfasst. Die Schritte ergeben sich aus dem Aufbau des Einstiegs.`,
        )}
      </p>
    </>
  );
}

/**
 * The figures of the introduction for the operator (US-ONB-08): derived from existing creation dates only, aggregated,
 * unknown below a minimum of accounts. A failure to load stays visible as text (P-10) and blocks nothing else.
 */
export function IntroductionSection(props: { api: string; token: Token }) {
  const { api, token } = props;
  const load = useCallback((t: string) => loadIntroduction(api, t), [api]);
  return (
    <section aria-labelledby="introduction-title" className="flex flex-col gap-3">
      <h2 id="introduction-title" className="text-xl font-semibold">
        Einstieg
      </h2>
      <LoadFrame
        queryKey={["account", "operator", "introduction"]}
        token={token}
        load={load}
        loadingText="Einstiegszahlen werden geladen …"
        loadingFallback={<p role="status">Einstiegszahlen werden geladen …</p>}
      >
        {(figures: IntroductionFigures) => <Figures figures={figures} />}
      </LoadFrame>
    </section>
  );
}

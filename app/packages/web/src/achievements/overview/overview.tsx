import { useCallback } from "react";
import { Link } from "react-router";
import {
  PATHS,
  SPECIES_MODE_ADDRESS,
} from "@/components/shared/navigation/nav-model/navigation/navigation";
import { Skeleton, SkeletonGroup } from "@/components/ui/display/skeleton/skeleton";
import { Button } from "@/components/ui/button/button";
import { errorText } from "@/lib/error-text";
import { LoadFrame, useInvalidate, useWriteAction } from "../../kernel";
import {
  loadAchievements,
  markSeen,
  type AchievementItem,
  type AchievementsOverview,
} from "../achievements-api";
import { ACHIEVEMENT_NAMES, GROUP_TITLES, MISSING_TEXTS, germanDate, nextStepText } from "./texts";

type Token = () => Promise<string | undefined>;
type Shown = Extract<AchievementsOverview, { calmMode: false }>;

const CARD =
  "m-0 flex min-w-0 list-none flex-col gap-1 rounded-card bg-card p-4 shadow-elevation-1";

function Earned({ item }: { item: AchievementItem }) {
  return (
    <li className={CARD}>
      <p className="m-0 font-semibold">
        {ACHIEVEMENT_NAMES[item.id] ?? item.id}
        {item.isNew && <span className="ml-2 text-sm font-normal">(neu)</span>}
      </p>
      <p className="m-0 text-sm text-muted-foreground">
        Erreicht am {item.earnedOn ? germanDate(item.earnedOn) : "unbekannt"}
        {item.specimenName && (
          <>
            {" mit "}
            <Link to={PATHS.collection} className="underline">
              {item.specimenName}
            </Link>
          </>
        )}
      </p>
    </li>
  );
}

function Open({ item }: { item: AchievementItem }) {
  const step = item.nextStep;
  return (
    <li className={CARD}>
      <p className="m-0 font-semibold">{ACHIEVEMENT_NAMES[item.id] ?? item.id}</p>
      {step && (
        <p className="m-0 text-sm">Nächster Schritt: {nextStepText(step.key, step.specimenName)}</p>
      )}
      {item.missing && (
        <p className="m-0 text-sm text-muted-foreground">
          {MISSING_TEXTS[item.missing] ?? "Es fehlen Daten."}
        </p>
      )}
    </li>
  );
}

/** "Okay" writes the seen state of the new achievements; they stay earned and only lose the mark (US-ACH-03). */
function NewNotice(props: { api: string; token: Token; ids: string[] }) {
  const { api, token, ids } = props;
  const reload = useInvalidate(["achievements"]);
  const write = useWriteAction(token, reload);
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-2 rounded-lg border border-primary p-3"
    >
      <p className="m-0">
        {ids.length === 1 ? "1 neuer Erfolg." : `${ids.length} neue Erfolge.`} Sie sind unten mit
        „neu“ markiert.
      </p>
      <Button
        variant="outline"
        pending={write.running}
        pendingLabel="Wird gespeichert …"
        onClick={() => void write.run((t) => markSeen(api, t, ids), "")}
      >
        Okay
      </Button>
      {write.error && (
        <p role="alert" className="m-0 text-destructive">
          {errorText(write.error.code)}
        </p>
      )}
    </div>
  );
}

function Groups({ overview, api, token }: { overview: Shown; api: string; token: Token }) {
  const newIds = overview.groups.flatMap((g) => g.earned.filter((i) => i.isNew).map((i) => i.id));
  const allEarned = overview.groups.every((g) => g.open.length === 0);
  return (
    <div className="flex min-w-0 max-w-xl flex-col gap-4">
      {newIds.length > 0 && <NewNotice api={api} token={token} ids={newIds} />}
      {overview.firstStep && (
        <p className="m-0 rounded-lg border border-border p-3">
          Dein erster Schritt:{" "}
          {nextStepText(overview.firstStep.key, overview.firstStep.specimenName)}
        </p>
      )}
      {overview.groups.map((g) => (
        <section
          key={g.group}
          aria-label={GROUP_TITLES[g.group] ?? g.group}
          className="flex flex-col gap-2"
        >
          <h3 className="m-0 text-lg font-semibold">{GROUP_TITLES[g.group] ?? g.group}</h3>
          {g.group === "collecting" ? (
            <p className="m-0 text-sm">
              Rang, Fortschritt und Meilensteine des Sammelns findest du im{" "}
              <Link to={SPECIES_MODE_ADDRESS} className="underline">
                Pokédex
              </Link>
              .
            </p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {g.earned.map((i) => (
                <Earned key={i.id} item={i} />
              ))}
              {g.open.map((i) => (
                <Open key={i.id} item={i} />
              ))}
            </ul>
          )}
        </section>
      ))}
      {allEarned && (
        <p className="m-0 text-sm text-muted-foreground">
          Du hast alle Erfolge dieser Liste erreicht. Pflege einfach weiter; neue Erfolge erscheinen
          hier.
        </p>
      )}
    </div>
  );
}

/**
 * The overview of the achievements (US-ACH-02): earned ones with date and specimen, open ones with the next step or
 * the data that is missing. Derived from the own data on every visit; no percentage, no score, no comparison
 * (FR-ACH-04). In calm mode nothing is shown (US-ACH-08).
 */
export function AchievementsOverviewSection(props: { api: string; token: Token }) {
  const load = useCallback((t: string) => loadAchievements(props.api, t), [props.api]);
  const loading = "Erfolge werden geladen …";
  return (
    <LoadFrame
      queryKey={["achievements", "overview"]}
      token={props.token}
      load={load}
      loadingText={loading}
      loadingFallback={
        <SkeletonGroup label={loading} className="flex min-w-0 max-w-xl flex-col gap-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </SkeletonGroup>
      }
    >
      {(overview) =>
        overview.calmMode ? null : (
          <Groups overview={overview} api={props.api} token={props.token} />
        )
      }
    </LoadFrame>
  );
}

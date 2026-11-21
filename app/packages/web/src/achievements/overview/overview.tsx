import { useCallback } from "react";
import { Link } from "react-router";
import { PATHS, SPECIES_MODE_ADDRESS } from "@/shared/patterns/navigation/navigation/navigation";
import { texts } from "@/shared/lib/text-rules/texts";
import { Skeleton, SkeletonGroup } from "@/shared/ui/display/skeleton/skeleton";
import { Button } from "@/shared/ui/button/button";
import { LayerPart } from "@/shared/patterns/responsive/layer-sheet/layer-part/layer-part";
import {
  PagedGroups,
  type PagedGroup,
} from "@/shared/patterns/responsive/paged-groups/paged-groups";
import { errorText } from "@/shared/lib/error-text";
import { LoadFrame, useInvalidate, useWriteAction } from "../../shared/data";
import {
  loadAchievements,
  markSeen,
  type AchievementItem,
  type AchievementsOverview,
} from "../achievements-api";
import { ACHIEVEMENT_NAMES, GROUP_TITLES, MISSING_TEXTS, germanDate, nextStepText } from "./texts";
import { StateSection, type AchievementSection } from "./state-section/state-section";
import table from "./overview.de.json";

const text = texts(table);
type Token = () => Promise<string | undefined>;
type Shown = Extract<AchievementsOverview, { calmMode: false }>;

/**
 * Sections per page inside the layer (starting value, assumption; US-QS-15). A group has two sections at most (earned
 * and open), so a group stays on one page.
 */
const PAGE = 3;

const CARD = "flex min-w-0 flex-col gap-0.5 rounded-card bg-card p-4 shadow-elevation-1";

function Earned({ item }: { item: AchievementItem }) {
  return (
    <div className={CARD}>
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
    </div>
  );
}

function Open({ item }: { item: AchievementItem }) {
  const step = item.nextStep;
  return (
    <div className={CARD}>
      <p className="m-0 font-semibold">{ACHIEVEMENT_NAMES[item.id] ?? item.id}</p>
      {step && (
        <p className="m-0 text-sm">Nächster Schritt: {nextStepText(step.key, step.specimenName)}</p>
      )}
      {item.missing && (
        <p className="m-0 text-sm text-muted-foreground">
          {MISSING_TEXTS[item.missing] ?? "Es fehlen Daten."}
        </p>
      )}
    </div>
  );
}

/** The cards of each state: earned newest first, open in the order of the definitions (US-ACH-02). */
const CARDS = { earned: Earned, open: Open };

/** "Als gesehen markieren" writes the seen state of the new achievements; they stay earned and only lose the mark (US-ACH-03). */
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
        {ids.length === 1 ? "1 neuer Erfolg." : `${ids.length} neue Erfolge.`} Sie stehen in den
        Erfolgen mit „neu“ markiert.
      </p>
      <Button
        variant="outline"
        pending={write.running}
        pendingLabel="Sichert …"
        // A seen mark: a background write with its own key, it frees no held key (US-QS-03).
        onClick={() => void write.runSilent((t, opts) => markSeen(api, t, ids, opts), "")}
      >
        Als gesehen markieren
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
  const earned = overview.groups.reduce((n, g) => n + g.earned.length, 0);
  // The group Sammeln has no achievements of its own; it names the Pokédex instead (US-ACH-02).
  const groups: PagedGroup<AchievementSection>[] = overview.groups
    .filter((g) => g.group !== "collecting")
    .map((g) => ({
      key: g.group,
      label: GROUP_TITLES[g.group] ?? g.group,
      // The choice counts the earned of all achievements of the group, open ones included (US-ACH-02).
      countText: text("count", { earned: g.earned.length, total: g.earned.length + g.open.length }),
      // A state without achievements has no section (SG-LIST-07: the choice already says how many are earned).
      items: [
        { kind: "earned" as const, items: g.earned },
        { kind: "open" as const, items: g.open },
      ].filter((s) => s.items.length > 0),
    }));
  return (
    <>
      {newIds.length > 0 && <NewNotice api={api} token={token} ids={newIds} />}
      {overview.firstStep && (
        <p className="m-0 min-w-0 rounded-lg border border-border p-3">
          Dein erster Schritt:{" "}
          {nextStepText(overview.firstStep.key, overview.firstStep.specimenName)}
        </p>
      )}
      <LayerPart
        id="earned"
        title="Erfolge"
        value={earned === 0 ? "Noch keiner erreicht" : `${earned} erreicht`}
      >
        <div className="flex min-w-0 flex-col gap-2">
          <PagedGroups
            choicesLabel="Gruppen der Erfolge"
            listLabel="Erfolge"
            groups={groups}
            pageSize={PAGE}
            getKey={(s) => s.kind}
            renderItem={(s) => <StateSection section={s} card={CARDS[s.kind]} />}
          />
          <p className="m-0 text-sm">
            Rang und Meilensteine stehen im{" "}
            <Link to={SPECIES_MODE_ADDRESS} className="underline">
              Pokédex
            </Link>
            .
          </p>
          {allEarned && (
            <p className="m-0 text-sm text-muted-foreground">
              Du hast alle Erfolge dieser Liste erreicht. Pflege einfach weiter; neue Erfolge
              erscheinen hier.
            </p>
          )}
        </div>
      </LayerPart>
    </>
  );
}

/**
 * The overview of the achievements (US-ACH-02): earned ones with date and specimen, open ones with the next step or
 * the data that is missing. Derived from the own data on every visit; no percentage, no score, no comparison with others
 * (FR-ACH-04). The list is one layer "Erfolge" in pages by group (US-QS-15); each group shows its earned and its open
 * achievements as the sections "Erreicht" and "Noch offen", a state without achievements is not shown. In calm mode
 * nothing is shown (US-ACH-08).
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

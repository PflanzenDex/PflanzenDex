import { useCallback } from "react";
import type { TodayItem, TodayKind, TodayList, TodayTarget } from "@pflanzendex/core";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionLabel } from "@/components/section-label/section-label";
import { Button } from "@/components/ui/button";
import { dateText } from "@/lib/format";
import { LoadFrame } from "../../kernel";
import { loadToday } from "../today-api";

/** Where an action leads: the app wires the destination to a view (the modules do not know each other). */
export type TodayDestination = TodayTarget | "collection";

const KEY = ["today", "list"] as const;
const LABEL: Record<TodayKind, string> = {
  treatment_overdue: "Überfällig",
  treatment_due: "Heute fällig",
  phase_deviation: "Abweichung",
  specimen_incomplete: "Angaben fehlen",
};
const GO: Record<TodayTarget, string> = {
  treatments: "Zu Behandlung",
  care_phases: "Zu Pflegephasen",
  hints: "Zu Hinweisen",
};
const CARD =
  "min-w-0 rounded-card bg-card p-3 text-card-foreground shadow-elevation-1 [overflow-wrap:anywhere]";
const URGENT = "border-warning-border bg-warning text-warning-foreground";

function Item(props: { item: TodayItem; onOpen: (d: TodayDestination) => void }) {
  const { item } = props;
  const urgent = item.kind === "treatment_overdue" || item.kind === "treatment_due";
  return (
    <li className={`${CARD} flex flex-col gap-1 ${urgent ? URGENT : ""}`}>
      <p className="font-bold">{LABEL[item.kind]}</p>
      <p>{item.text}</p>
      <p className="text-sm">{item.nextAction}</p>
      <Button
        type="button"
        variant="secondary"
        className="mt-2 self-start"
        aria-label={`${GO[item.target]}: ${item.specimenName}`}
        onClick={() => props.onOpen(item.target)}
      >
        {GO[item.target]}
      </Button>
    </li>
  );
}

const laterText = (n: number): string =>
  n === 1
    ? "Ein weiterer Behandlungstermin steht später an."
    : `${n} weitere Behandlungstermine stehen später an.`;

function Content(props: { list: TodayList; onOpen: (d: TodayDestination) => void }) {
  const { list } = props;
  if (list.items.length === 0)
    return (
      <EmptyState
        title="Heute steht nichts an."
        level={3}
        description={
          list.upcoming > 0
            ? laterText(list.upcoming)
            : "Keine Behandlung ist fällig, keine Pflanze steht falsch und keine Angabe fehlt."
        }
        action={{ label: "Zum Bestand", onClick: () => props.onOpen("collection") }}
      />
    );
  return (
    <>
      <p className="font-semibold">
        {list.items.length === 1 ? "1 Sache steht an." : `${list.items.length} Dinge stehen an.`}
      </p>
      <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-label="Heute zu tun">
        {list.items.map((item) => (
          <Item key={item.id} item={item} onOpen={props.onOpen} />
        ))}
      </ul>
      {list.upcoming > 0 && (
        <p className="text-sm text-muted-foreground">{laterText(list.upcoming)}</p>
      )}
    </>
  );
}

/**
 * The central "Today" list (TE-07): what needs action today, most urgent first: treatments overdue or due, plants
 * standing away from their target location, incomplete specimens. Every entry says what to do next and leads to the
 * place where it is done (P-09); an empty list says so, with what is still ahead (P-10). It is the first section,
 * "Jetzt dran", of the destination "Heute"; the app adds the treatments and the missing details below (US-QS-14).
 */
export function TodayPage(props: {
  api: string;
  token: () => Promise<string | undefined>;
  onOpen: (d: TodayDestination) => void;
}) {
  const { api } = props;
  const load = useCallback((t: string) => loadToday(api, t), [api]);
  const loading = "Heute wird geladen …";
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <h1 id="today-title" className="text-2xl font-semibold">
        Heute
      </h1>
      <section aria-labelledby="now-title" className="flex min-w-0 flex-col gap-3">
        <SectionLabel id="now-title">Jetzt dran</SectionLabel>
        <LoadFrame queryKey={KEY} token={props.token} load={load} loadingText={loading}>
          {(list: TodayList) => (
            <>
              <p className="text-sm text-muted-foreground">Stand: {dateText(list.date)}</p>
              <Content list={list} onOpen={props.onOpen} />
            </>
          )}
        </LoadFrame>
      </section>
    </div>
  );
}

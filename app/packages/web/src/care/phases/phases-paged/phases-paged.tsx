import { PagedGroups } from "@/components/shared/responsive/paged-groups/paged-groups";
import type { CarePhase, LightLocation, PhasesRow } from "@pflanzendex/core";
import { useIsLg, useIsMd } from "@/lib/use-breakpoint";
import { PHASE_TEXT } from "../../shared/text";
import { Groups, type Confirm } from "../phases-list/phases-list";
import { Entry } from "../phases-list/entry/entry";

const PHASES: readonly CarePhase[] = ["dormancy", "growth"];

/** Entries per page (starting values, assumption): a phase entry is a tall card with its own action. */
function usePageSize(): number {
  const md = useIsMd();
  const lg = useIsLg();
  return lg ? 6 : md ? 4 : 2;
}

/**
 * The plants with a care phase as the grouping "Nach Pflegephase" (US-QS-19): the phase is chosen from a row with its
 * count and the plants of that phase page. "Jetzt umgestellt" and the group buttons work as in the list (US-PHA-03).
 * The paging is the shared `PagedGroups`, which the plants use too.
 */
export function PhasesPaged(props: {
  rows: readonly PhasesRow[];
  locations: readonly LightLocation[];
  busy: boolean;
  onConfirm: Confirm;
}) {
  const size = usePageSize();
  const groups = PHASES.map((phase) => ({
    key: phase,
    label: PHASE_TEXT[phase],
    items: props.rows.filter((z) => z.phase === phase),
  })).filter((g) => g.items.length > 0);
  return (
    <section aria-labelledby="care-phases-title" className="flex flex-col gap-3">
      <PagedGroups
        choicesLabel="Pflegephase wählen"
        listLabel="Pflanzen mit Pflegephase"
        groups={groups}
        pageSize={size}
        getKey={(z) => z.specimenId}
        intro={(g) => (
          <Groups
            rows={g.items}
            locations={props.locations}
            busy={props.busy}
            onConfirm={props.onConfirm}
          />
        )}
        renderItem={(z) => (
          <Entry
            bare
            row={z}
            locations={props.locations}
            busy={props.busy}
            onConfirm={props.onConfirm}
          />
        )}
      />
    </section>
  );
}

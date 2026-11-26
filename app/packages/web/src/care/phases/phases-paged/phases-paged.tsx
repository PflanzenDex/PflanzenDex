import { GroupSections } from "@/shared/lists/grouped-list/grouped-sections/grouped-sections";
import type { SectionGroup } from "@/shared/lists/grouped-list/grouped-sections/group-section/group-section";
import type { CarePhase, LightLocation, PhasesRow } from "@pflanzendex/core";
import type { PhotoAccess } from "@/shared/platform/browser/use-stored-photo";
import { OBJECT_GROUP } from "@/shared/lists/grouped-list/group-classes";
import { plurals, texts } from "@/shared/lib/text-rules/texts";
import { PHASE_TEXT } from "../../shared/text";
import { Groups, type Confirm, type GroupUndo } from "../phases-list/phases-list";
import { Entry } from "../phases-list/entry/entry";
import table from "../phases-list/phases-list.de.json";

const ui = texts(table);
const plural = plurals(table);

/** The fixed set of care phases, in their fixed order (SG-LIST-06): every phase has its section. */
const PHASES: readonly CarePhase[] = ["dormancy", "growth"];

/** Entries asked for past the loaded ones in one step; the phase list holds every plant, so it asks for none. */
const PAGE_SIZE = 8;

/**
 * The plants with a care phase as the grouping "Nach Pflegephase" (US-QS-19, SG-LIST-06): the phases are a fixed set, so
 * both are sections of one scrolling list in their fixed order, and a phase without a plant shows a quiet line under its
 * heading. "Umstellen" and the group buttons work as in the list (US-PHA-03); the group buttons stand under the heading of
 * their phase. The chips jump to a phase.
 */
export function PhasesPaged(props: {
  rows: readonly PhasesRow[];
  locations: readonly LightLocation[];
  busy: boolean;
  onConfirm: Confirm;
  /** The photos of the rows' thumbnails (US-QS-32); without it the thumbnails show the drawn placeholder. */
  access?: PhotoAccess;
  /** The undo of a bulk move held in place (US-QS-32). */
  groupUndo?: GroupUndo | undefined;
}) {
  const groups: SectionGroup<PhasesRow>[] = PHASES.map((phase) => {
    const items = props.rows.filter((z) => z.phase === phase);
    return {
      key: phase,
      label: PHASE_TEXT[phase],
      items,
      countText: plural.counted("phaseCount", items.length),
      empty: ui("phaseNone"),
      ...(items.length === 0
        ? {}
        : {
            intro: (
              <Groups
                rows={items}
                locations={props.locations}
                busy={props.busy}
                onConfirm={props.onConfirm}
                groupUndo={props.groupUndo}
              />
            ),
          }),
    };
  });
  return (
    <section aria-labelledby="care-phases-title" className="flex min-h-0 flex-1 flex-col gap-3">
      <GroupSections
        label={ui("list")}
        // The page's section heading "Pflegephasen" is an h2 (sr-only), so the phases are h3 (SG-HEAD-03).
        level={3}
        jumpLabel={ui("jump")}
        groups={groups}
        list={{
          listLabel: ui("list"),
          pageSize: PAGE_SIZE,
          listClassName: OBJECT_GROUP,
          getKey: (z) => z.specimenId,
          renderItem: (z) => (
            <Entry
              bare
              row={z}
              locations={props.locations}
              busy={props.busy}
              onConfirm={props.onConfirm}
              access={props.access}
            />
          ),
        }}
      />
    </section>
  );
}

import type { UnidentifiedSpecimen } from "@pflanzendex/core";
import { ObjectRow } from "@/shared/lists/object-row/object-row";
import { OBJECT_GROUP } from "@/shared/lists/grouped-list/group-classes";
import { PATHS, plantLayerId } from "@/shared/patterns/navigation/navigation/navigation";
import { ScrollEntries } from "@/shared/patterns/responsive/pager/paging/scroll-entries/scroll-entries";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "../pokedex-page.de.json";

const ui = texts(table);

/** The plant of a specimen in its plant layer (US-QS-22, US-QS-32). */
const plantAddress = (id: string) => `${PATHS.collection}?view=plants&sheet=${plantLayerId(id)}`;

/** The Latin name as stored (or "unbekannt"), plus its own next action when the rows do not share one (P-08, P-09). */
const metaOf = (s: UnidentifiedSpecimen, common: string | null) => {
  const name = s.latinName ?? ui("uncountedUnknown");
  return common === null ? `${name} · ${s.nextAction}` : name;
};

/**
 * The specimens that do not count yet (US-QS-32): one line says why and what to do, once; then one row per plant that opens
 * the plant. The layer says so instead of staying empty (P-09).
 */
export function Unidentified(props: { specimens: readonly UnidentifiedSpecimen[] }) {
  if (props.specimens.length === 0) return <p className="text-sm">{ui("uncountedNone")}</p>;
  // A next action the rows share is said once, in the explanation (P-09).
  const actions = new Set(props.specimens.map((s) => s.nextAction));
  const common = actions.size === 1 ? ([...actions][0] ?? null) : null;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="text-sm">
        {common === null ? ui("uncountedExplain") : `${ui("uncountedExplain")} ${common}`}
      </p>
      <ScrollEntries
        items={props.specimens}
        pageSize={4}
        label={ui("uncountedTitle")}
        listClassName={OBJECT_GROUP}
        getKey={(s) => s.specimenId}
        renderItem={(s) => (
          <ObjectRow
            to={plantAddress(s.specimenId)}
            title={s.specimenName}
            meta={metaOf(s, common)}
          />
        )}
      />
    </div>
  );
}

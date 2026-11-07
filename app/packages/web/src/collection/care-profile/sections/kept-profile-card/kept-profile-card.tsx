import type { CareProfileEntry } from "@pflanzendex/core";
import type { Lists } from "../care-profile-sections/care-profile-sections";
import { CARD, NextAction, Quiet } from "../../../specimens/cards/parts/parts";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "./kept-profile-card.de.json";

const ui = texts(table);

const nameOf = (list: readonly { id: string; name: string }[], id: string | null) =>
  id === null ? null : (list.find((x) => x.id === id)?.name ?? ui("unknown"));

/**
 * A care profile that stayed on a proposal a reviewer merged (US-BES-10, P-10): shown read-only with what happened
 * and what to do next, so it neither vanishes nor can be edited on a species that is gone. The entry carries the
 * target species' name and a notice code; the wording is this card's own message table.
 */
export function KeptProfileCard(props: { entry: CareProfileEntry; lists: Lists }) {
  const { entry, lists } = props;
  const { profile: p, notice, mergedInto } = entry;
  const target = mergedInto?.speciesName ?? entry.speciesName;
  const rows: [string, string | null][] = [
    [ui("row.growthLocation"), nameOf(lists.locations, p.growthLocation.own)],
    [ui("row.dormancyLocation"), nameOf(lists.locations, p.dormancyLocation.own)],
    [ui("row.lightZone"), nameOf(lists.zones, p.lightZone.own)],
    [
      ui("row.dormancy"),
      p.dormancy.own
        ? ui("range", { from: p.dormancy.own.from, until: p.dormancy.own.until })
        : null,
    ],
    [ui("row.wateringGrowth"), p.wateringGrowthDays.own?.toString() ?? null],
    [ui("row.wateringDormancy"), p.wateringDormancyDays.own?.toString() ?? null],
    [ui("row.ownHints"), p.ownHints.own],
  ];
  return (
    <section className={CARD} aria-labelledby={`profile-${entry.speciesId}`}>
      <h3 id={`profile-${entry.speciesId}`} className="text-xl font-semibold">
        {ui("heading")}
      </h3>
      {notice?.code === "proposal_merged" && (
        <div className="rounded-lg border border-border p-3">
          <p>{ui("notice", { name: target })}</p>
          <NextAction>{ui("nextAction", { name: target })}</NextAction>
        </div>
      )}
      <dl className="m-0 grid gap-1">
        {rows.flatMap(([label, value]) =>
          value === null
            ? []
            : [
                <dt key={`t-${label}`} className="text-sm text-muted-foreground">
                  {label}
                </dt>,
                <dd key={`d-${label}`} className="m-0 break-words">
                  {value}
                </dd>,
              ],
        )}
      </dl>
      {mergedInto && <Quiet>{ui("target", { name: mergedInto.speciesName })}</Quiet>}
    </section>
  );
}

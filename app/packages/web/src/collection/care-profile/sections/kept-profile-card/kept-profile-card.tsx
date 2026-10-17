import type { CareProfileEntry } from "@pflanzendex/core";
import type { Lists } from "../care-profile-sections/care-profile-sections";
import { CARD, NextAction, Quiet } from "../../../specimens/cards/parts/parts";

const nameOf = (list: readonly { id: string; name: string }[], id: string | null) =>
  id === null ? null : (list.find((x) => x.id === id)?.name ?? "unbekannt");

/**
 * A care profile that stayed on a proposal a reviewer merged (US-BES-10, P-10): shown read-only with what happened
 * and what to do next, so it neither vanishes nor can be edited on a species that is gone.
 */
export function KeptProfileCard(props: { entry: CareProfileEntry; lists: Lists }) {
  const { entry, lists } = props;
  const { profile: p, notice, mergedInto } = entry;
  const rows: [string, string | null][] = [
    ["Soll-Standort Wachstum", nameOf(lists.locations, p.growthLocation.own)],
    ["Soll-Standort Ruhephase", nameOf(lists.locations, p.dormancyLocation.own)],
    ["Lichtzone", nameOf(lists.zones, p.lightZone.own)],
    ["Ruhephase", p.dormancy.own ? `${p.dormancy.own.from} bis ${p.dormancy.own.until}` : null],
    ["Gießen Wachstum (Tage)", p.wateringGrowthDays.own?.toString() ?? null],
    ["Gießen Ruhephase (Tage)", p.wateringDormancyDays.own?.toString() ?? null],
    ["Eigene Hinweise", p.ownHints.own],
  ];
  return (
    <section className={CARD} aria-labelledby={`profile-${entry.speciesId}`}>
      <h3 id={`profile-${entry.speciesId}`} className="text-xl font-semibold">
        {entry.speciesName}
      </h3>
      {notice && (
        <div className="rounded-lg border border-border p-3">
          <p>{notice.text}</p>
          <NextAction>{notice.nextAction}</NextAction>
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
      {mergedInto && <Quiet>Zielart: {mergedInto.speciesName}</Quiet>}
    </section>
  );
}

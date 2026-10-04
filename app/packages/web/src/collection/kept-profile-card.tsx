import type { CareProfileEntry } from "@pflanzendex/core";
import type { Lists } from "./care-profile-sections";

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
    <section className="specimen-card profile-card" aria-labelledby={`profile-${entry.speciesId}`}>
      <h2 id={`profile-${entry.speciesId}`}>{entry.speciesName}</h2>
      {notice && (
        <div className="hint">
          <p>{notice.text}</p>
          <p className="next-action">{notice.nextAction}</p>
        </div>
      )}
      <dl className="facts">
        {rows.flatMap(([label, value]) =>
          value === null
            ? []
            : [<dt key={`t-${label}`}>{label}</dt>, <dd key={`d-${label}`}>{value}</dd>],
        )}
      </dl>
      {mergedInto && <p className="quiet">Zielart: {mergedInto.speciesName}</p>}
    </section>
  );
}

import type {
  CareProfileChanges,
  CareProfileEntry,
  LightLocation,
  LightZone,
} from "@pflanzendex/core";
import type { Draft } from "./care-profile-draft";
import { Choice, MonthDay, Row, dayText } from "./care-profile-fields";

export const NAME = {
  growth: "Soll-Standort Wachstumsphase",
  dormancy: "Soll-Standort Ruhephase",
  zone: "Lichtzone",
  period: "Ruhephase",
  wateringGrowth: "Gießintervall Wachstumsphase",
  wateringDormancy: "Gießintervall Ruhephase",
  hints: "Eigene Hinweise",
} as const;

export interface Lists {
  readonly locations: readonly LightLocation[];
  readonly zones: readonly LightZone[];
}

export function Days(props: {
  entry: CareProfileEntry;
  draft: Draft;
  set: (d: Partial<Draft>) => void;
  reset: (field: CareProfileChanges, label: string) => void;
  busy: boolean;
}) {
  const { entry, draft, set, busy } = props;
  const name = entry.speciesName;
  const p = entry.profile;
  const days = (
    label: string,
    key: "wateringGrowthDays" | "wateringDormancyDays",
    own: boolean,
  ) => (
    <Row
      label={label}
      species={name}
      catalog="unbekannt"
      hasOwn={own}
      busy={busy}
      onReset={() => props.reset({ [key]: null }, label)}
    >
      <label>
        {`${label} (Tage) für „${name}“`}
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={365}
          value={draft[key]}
          onChange={(e) => set({ [key]: e.target.value })}
        />
      </label>
    </Row>
  );
  return (
    <>
      {days(NAME.wateringGrowth, "wateringGrowthDays", p.wateringGrowthDays.own !== null)}
      {days(NAME.wateringDormancy, "wateringDormancyDays", p.wateringDormancyDays.own !== null)}
      {entry.wateringHint && <p className="quiet">{`Hinweis der Art: ${entry.wateringHint}`}</p>}
    </>
  );
}

export function Dormancy(props: {
  entry: CareProfileEntry;
  draft: Draft;
  set: (d: Partial<Draft>) => void;
  reset: (field: CareProfileChanges, label: string) => void;
  busy: boolean;
}) {
  const { entry, draft, set } = props;
  const name = entry.speciesName;
  const catalog = entry.profile.dormancy.catalog;
  return (
    <Row
      label={NAME.period}
      species={name}
      catalog={catalog ? `${dayText(catalog.from)} bis ${dayText(catalog.until)}` : "unbekannt"}
      hasOwn={entry.profile.dormancy.own !== null}
      busy={props.busy}
      onReset={() => props.reset({ dormancyFrom: null, dormancyUntil: null }, NAME.period)}
    >
      <MonthDay
        label="Ruhephase von"
        species={name}
        month={draft.fromMonth}
        day={draft.fromDay}
        onMonth={(v) => set({ fromMonth: v })}
        onDay={(v) => set({ fromDay: v })}
      />
      <MonthDay
        label="Ruhephase bis"
        species={name}
        month={draft.untilMonth}
        day={draft.untilDay}
        onMonth={(v) => set({ untilMonth: v })}
        onDay={(v) => set({ untilDay: v })}
      />
    </Row>
  );
}

export function Places(props: {
  entry: CareProfileEntry;
  draft: Draft;
  lists: Lists;
  set: (d: Partial<Draft>) => void;
  reset: (field: CareProfileChanges, label: string) => void;
  busy: boolean;
}) {
  const { entry, draft, lists, set, busy } = props;
  const name = entry.speciesName;
  const p = entry.profile;
  const zone = lists.zones.find((z) => z.id === p.lightZone.catalog)?.name ?? "unbekannt";
  return (
    <>
      {lists.locations.length > 0 &&
        (
          [
            [NAME.growth, "growthLocationId", p.growthLocation.own],
            [NAME.dormancy, "dormancyLocationId", p.dormancyLocation.own],
          ] as const
        ).map(([label, key, own]) => (
          <Row
            key={key}
            label={label}
            species={name}
            catalog="unbekannt"
            hasOwn={own !== null}
            busy={busy}
            onReset={() => props.reset({ [key]: null }, label)}
          >
            <Choice
              label={`${label} für „${name}“`}
              value={draft[key]}
              items={lists.locations}
              onChange={(v) => set({ [key]: v })}
            />
          </Row>
        ))}
      <Row
        label={NAME.zone}
        species={name}
        catalog={zone}
        hasOwn={p.lightZone.own !== null}
        busy={busy}
        onReset={() => props.reset({ lightZoneId: null }, NAME.zone)}
      >
        <Choice
          label={`${NAME.zone} für „${name}“`}
          value={draft.lightZoneId}
          items={lists.zones}
          onChange={(v) => set({ lightZoneId: v })}
        />
      </Row>
    </>
  );
}

/** Own free-text hints, private (DM-BES-04). */
export function Hints(props: {
  entry: CareProfileEntry;
  draft: Draft;
  set: (d: Partial<Draft>) => void;
  reset: (field: CareProfileChanges, label: string) => void;
  busy: boolean;
}) {
  const name = props.entry.speciesName;
  return (
    <Row
      label={NAME.hints}
      species={name}
      catalog="keine"
      hasOwn={props.entry.profile.ownHints.own !== null}
      busy={props.busy}
      onReset={() => props.reset({ ownHints: null }, NAME.hints)}
    >
      <label>
        {`${NAME.hints} für „${name}“`}
        <textarea
          rows={3}
          maxLength={1000}
          value={props.draft.ownHints}
          onChange={(e) => props.set({ ownHints: e.target.value })}
        />
      </label>
    </Row>
  );
}

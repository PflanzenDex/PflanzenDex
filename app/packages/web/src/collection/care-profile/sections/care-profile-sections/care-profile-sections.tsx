import type { Control } from "react-hook-form";
import type {
  CareProfileChanges,
  CareProfileEntry,
  LightLocation,
  LightZone,
} from "@pflanzendex/core";
import { Quiet } from "../../../specimens/cards/parts/parts";
import {
  Choice,
  DaysInput,
  HintsInput,
  MonthDay,
  Row,
  dayText,
} from "../care-profile-fields/care-profile-fields";
import type { CareProfileFields as Fields } from "../../../specimens/model/schemas";

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

/** What every section of the card gets: the entry, the form and the reset of a field to the catalog. */
type Shared = {
  entry: CareProfileEntry;
  control: Control<Fields>;
  reset: (field: CareProfileChanges, label: string) => void;
  busy: boolean;
};

export function Days(props: Shared) {
  const { entry, control, busy } = props;
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
      <DaysInput control={control} name={key} label={`${label} (Tage) für „${name}“`} />
    </Row>
  );
  return (
    <>
      {days(NAME.wateringGrowth, "wateringGrowthDays", p.wateringGrowthDays.own !== null)}
      {days(NAME.wateringDormancy, "wateringDormancyDays", p.wateringDormancyDays.own !== null)}
      {entry.wateringHint && <Quiet>{`Hinweis der Art: ${entry.wateringHint}`}</Quiet>}
    </>
  );
}

export function Dormancy(props: Shared) {
  const { entry, control } = props;
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
        control={control}
        label="Ruhephase von"
        species={name}
        month="fromMonth"
        day="fromDay"
      />
      <MonthDay
        control={control}
        label="Ruhephase bis"
        species={name}
        month="untilMonth"
        day="untilDay"
      />
    </Row>
  );
}

export function Places(props: Shared & { lists: Lists }) {
  const { entry, control, lists, busy } = props;
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
              control={control}
              name={key}
              label={`${label} für „${name}“`}
              items={lists.locations}
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
          control={control}
          name="lightZoneId"
          label={`${NAME.zone} für „${name}“`}
          items={lists.zones}
        />
      </Row>
    </>
  );
}

/** Own free-text hints, private (DM-BES-04). */
export function Hints(props: Shared) {
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
      <HintsInput control={props.control} label={`${NAME.hints} für „${name}“`} />
    </Row>
  );
}

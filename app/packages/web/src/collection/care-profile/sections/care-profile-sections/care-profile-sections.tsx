import type { Control } from "react-hook-form";
import type {
  CareProfileChanges,
  CareProfileEntry,
  LightLocation,
  LightZone,
} from "@pflanzendex/core";
import { FieldLegend, FieldSet } from "@/shared/ui/field.set";
import { Quiet } from "../../../specimens/cards/parts/parts";
import {
  Choice,
  DaysInput,
  HintsInput,
  Row,
  dayText,
} from "../care-profile-fields/care-profile-fields";
import { MonthDay } from "../care-profile-fields/month-day/month-day";
import type { CareProfileFields as Fields } from "../../../specimens/model/schemas";
import { ZoneField } from "./zone-field/zone-field";

export const NAME = {
  growth: "Soll-Standort Wachstumsphase",
  dormancy: "Soll-Standort Ruhephase",
  zone: "Lichtzone",
  period: "Ruhephase",
  wateringGrowth: "Gießintervall Wachstumsphase",
  wateringDormancy: "Gießintervall Ruhephase",
  hints: "Eigene Hinweise",
} as const;

type PlaceField = "growth" | "dormancy" | "zone";

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
      <DaysInput control={control} name={key} label={label} species={name} />
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
      <FieldSet className="gap-3">
        <FieldLegend variant="label" className="mb-1">
          {NAME.period}
        </FieldLegend>
        <MonthDay control={control} when="from" species={name} month="fromMonth" day="fromDay" />
        <MonthDay control={control} when="until" species={name} month="untilMonth" day="untilDay" />
      </FieldSet>
    </Row>
  );
}

/** The locations and the zone of the profile; `fields` shows only some of them (a page of the profile, US-BES-09). */
export function Places(props: Shared & { lists: Lists; fields?: readonly PlaceField[] }) {
  const { entry, control, lists, busy } = props;
  const shown = (field: PlaceField) => !props.fields || props.fields.includes(field);
  const name = entry.speciesName;
  const p = entry.profile;
  return (
    <>
      {lists.locations.length > 0 &&
        (
          [
            ["growth", NAME.growth, "growthLocationId", p.growthLocation.own],
            ["dormancy", NAME.dormancy, "dormancyLocationId", p.dormancyLocation.own],
          ] as const
        )
          .filter(([field]) => shown(field))
          .map(([, label, key, own]) => (
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
                label={label}
                species={name}
                items={lists.locations}
              />
            </Row>
          ))}
      {shown("zone") && (
        <ZoneField
          entry={entry}
          control={control}
          busy={busy}
          reset={props.reset}
          zones={lists.zones}
          label={NAME.zone}
        />
      )}
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
      <HintsInput control={props.control} label={NAME.hints} species={name} />
    </Row>
  );
}

import { useRef } from "react";
import { zoneLabel } from "@pflanzendex/core";
import type { Control } from "react-hook-form";
import type { CareProfileChanges, CareProfileEntry, LightZone } from "@pflanzendex/core";
import { LightNeedAction } from "@/light";
import { Choice, Row } from "../care-profile-fields/care-profile-fields";
import type { CareProfileFields as Fields } from "../../../specimens/model/schemas";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "./zone-field.de.json";

const t = texts(table);

/** The zone of the profile with the next step of an unknown light need, which focuses the choice (US-LIC-01, P-09). */
export function ZoneField(props: {
  entry: CareProfileEntry;
  control: Control<Fields>;
  reset: (field: CareProfileChanges, label: string) => void;
  busy: boolean;
  zones: readonly LightZone[];
  label: string;
}) {
  const { entry, control, zones, busy, label } = props;
  const zoneChoice = useRef<HTMLSelectElement | null>(null);
  const name = entry.speciesName;
  const p = entry.profile;
  const zoneRaw = zones.find((z) => z.id === p.lightZone.catalog)?.name;
  const zone = zoneRaw === undefined ? t("zone.unknown") : zoneLabel(zoneRaw);
  return (
    <Row
      label={label}
      species={name}
      catalog={zone}
      hasOwn={p.lightZone.own !== null}
      busy={busy}
      onReset={() => props.reset({ lightZoneId: null }, label)}
    >
      <Choice
        control={control}
        name="lightZoneId"
        label={t("zone.for", { label, name })}
        items={zones}
        selectRef={zoneChoice}
      />
      {entry.lightNeedUnknown && (
        <LightNeedAction
          speciesId={entry.speciesId}
          speciesName={name}
          onChoose={() => zoneChoice.current?.focus()}
        />
      )}
    </Row>
  );
}

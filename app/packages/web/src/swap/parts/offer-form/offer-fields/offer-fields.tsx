import type { OfferMode, OfferType } from "@pflanzendex/core";
import { Label } from "@/components/ui/display/label/label";
import { Select } from "@/components/ui/fields/select/select";
import { Textarea } from "@/components/ui/fields/textarea/textarea";
import type { OwnSpecimenRow } from "../../../api/offers-api";
import { MODE_TEXT, TYPE_TEXT } from "../health-text";

export interface OfferFieldValues {
  specimenId: string;
  type: OfferType;
  mode: OfferMode;
  wish: string;
  note: string;
}

type FieldProps = { value: OfferFieldValues; onChange: (v: OfferFieldValues) => void };

/** The type of the offer (cutting, plant, offshoot) and the mode (swap or give away). */
function TypeModeFields({ value, onChange }: FieldProps) {
  return (
    <div className="flex flex-wrap gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="offer-type">Art des Angebots</Label>
        <Select
          id="offer-type"
          value={value.type}
          onChange={(e) => onChange({ ...value, type: e.target.value as OfferType })}
        >
          {(Object.keys(TYPE_TEXT) as OfferType[]).map((k) => (
            <option key={k} value={k}>
              {TYPE_TEXT[k]}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="offer-mode">Tauschen oder verschenken</Label>
        <Select
          id="offer-mode"
          value={value.mode}
          onChange={(e) => onChange({ ...value, mode: e.target.value as OfferMode })}
        >
          {(Object.keys(MODE_TEXT) as OfferMode[]).map((k) => (
            <option key={k} value={k}>
              {MODE_TEXT[k]}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}

/** The fields of the offer dialog (US-SOZ-08): specimen, type, mode, wish and note; the limits match the server. */
export function OfferFields(props: {
  specimens: readonly OwnSpecimenRow[];
  value: OfferFieldValues;
  onChange: (v: OfferFieldValues) => void;
}) {
  const { value, onChange } = props;
  return (
    <>
      <div className="flex flex-col gap-1">
        <Label htmlFor="offer-specimen">Exemplar</Label>
        <Select
          id="offer-specimen"
          value={value.specimenId}
          onChange={(e) => onChange({ ...value, specimenId: e.target.value })}
        >
          <option value="">Exemplar wählen</option>
          {props.specimens
            .filter((s) => s.status !== "archived")
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </Select>
      </div>
      <TypeModeFields value={value} onChange={onChange} />
      <div className="flex flex-col gap-1">
        <Label htmlFor="offer-wish">Wunsch (optional)</Label>
        <Textarea
          id="offer-wish"
          maxLength={200}
          value={value.wish}
          onChange={(e) => onChange({ ...value, wish: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="offer-note">Hinweis (optional)</Label>
        <Textarea
          id="offer-note"
          maxLength={500}
          value={value.note}
          onChange={(e) => onChange({ ...value, note: e.target.value })}
        />
      </div>
    </>
  );
}

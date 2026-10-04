import { WISH_LIMITS, type ZoneStock } from "@pflanzendex/core";
import type { ErrorField, FieldErrors, WishFields } from "./wish-input";

const plants = (n: number) => `${n} ${n === 1 ? "Pflanze" : "Pflanzen"}`;

export type Set = (change: Partial<WishFields>) => void;

/** `id`, `aria-invalid` (with a visible border from style.css) and `aria-describedby` of a field that may be refused. */
const marks = (key: ErrorField, errors: FieldErrors) => ({
  id: `wish-${key}`,
  "aria-invalid": errors[key] !== undefined,
  "aria-describedby": errors[key] !== undefined ? `wish-${key}-error` : undefined,
});

function FieldError({ field, errors }: { field: ErrorField; errors: FieldErrors }) {
  const text = errors[field];
  return text === undefined ? null : (
    <p id={`wish-${field}-error`} className="warning field-error">
      {text}
    </p>
  );
}

export function NameFields({
  fields,
  set,
  errors,
}: {
  fields: WishFields;
  set: Set;
  errors: FieldErrors;
}) {
  return (
    <>
      <label>
        Name
        <input
          {...marks("name", errors)}
          autoComplete="off"
          maxLength={WISH_LIMITS.name.max}
          value={fields.name}
          onChange={(e) => set({ name: e.target.value })}
        />
      </label>
      <FieldError field="name" errors={errors} />
      <label>
        Deutscher Name (optional)
        <input
          autoComplete="off"
          maxLength={WISH_LIMITS.german.max}
          value={fields.german}
          onChange={(e) => set({ german: e.target.value })}
        />
      </label>
    </>
  );
}

export function ChoiceFields(props: {
  fields: WishFields;
  set: Set;
  errors: FieldErrors;
  zones: readonly ZoneStock[];
}) {
  const { fields, set, errors } = props;
  return (
    <>
      <label>
        Ziel-Lichtzone
        <select
          {...marks("targetZoneId", errors)}
          value={fields.targetZoneId}
          onChange={(e) => set({ targetZoneId: e.target.value })}
        >
          <option value="">unbekannt</option>
          {props.zones.map((z) => (
            <option key={z.zoneId} value={z.zoneId}>
              {z.name} — {plants(z.count)}
            </option>
          ))}
        </select>
      </label>
      <FieldError field="targetZoneId" errors={errors} />
      <label>
        Schwierigkeit
        <select value={fields.difficulty} onChange={(e) => set({ difficulty: e.target.value })}>
          <option value="">unbekannt</option>
          <option value="1">Leicht</option>
          <option value="2">Mittel</option>
          <option value="3">Schwer</option>
        </select>
      </label>
      <label>
        Begründung (optional)
        <textarea
          rows={3}
          maxLength={WISH_LIMITS.reasoning.max}
          value={fields.reasoning}
          onChange={(e) => set({ reasoning: e.target.value })}
        />
      </label>
    </>
  );
}

export function ImageFields({
  fields,
  set,
  errors,
}: {
  fields: WishFields;
  set: Set;
  errors: FieldErrors;
}) {
  return (
    <>
      <label>
        Bild-Adresse (https)
        <input
          {...marks("imageUrl", errors)}
          type="url"
          autoComplete="off"
          maxLength={WISH_LIMITS.imageUrl.max}
          value={fields.imageUrl}
          onChange={(e) => set({ imageUrl: e.target.value })}
        />
      </label>
      <FieldError field="imageUrl" errors={errors} />
      <label>
        Bildquelle
        <input
          {...marks("imageSource", errors)}
          autoComplete="off"
          maxLength={WISH_LIMITS.imageSource.max}
          value={fields.imageSource}
          onChange={(e) => set({ imageSource: e.target.value })}
        />
      </label>
      <FieldError field="imageSource" errors={errors} />
      <p className="quiet">
        Das Bild wird nicht geladen: Auf der Karte erscheint nur ein Link zur Adresse, der erst auf
        deinen Klick hin öffnet.
      </p>
    </>
  );
}

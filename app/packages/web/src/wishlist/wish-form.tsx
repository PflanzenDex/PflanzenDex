import { useState, type FormEvent } from "react";
import { WISH_LIMITS, type ZoneStock } from "@pflanzendex/core";
import type { ApiError } from "../kernel";
import { checkWish, EMPTY_FIELDS, type WishFields } from "./wish-input";
import type { WishInput } from "./wishlist-api";

const plants = (n: number) => `${n} ${n === 1 ? "Pflanze" : "Pflanzen"}`;

type Set = (change: Partial<WishFields>) => void;

function NameFields({ fields, set }: { fields: WishFields; set: Set }) {
  return (
    <>
      <label>
        Name
        <input
          autoComplete="off"
          maxLength={WISH_LIMITS.name.max}
          value={fields.name}
          onChange={(e) => set({ name: e.target.value })}
        />
      </label>
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

function ChoiceFields(props: { fields: WishFields; set: Set; zones: readonly ZoneStock[] }) {
  const { fields, set } = props;
  return (
    <>
      <label>
        Ziel-Lichtzone
        <select value={fields.targetZoneId} onChange={(e) => set({ targetZoneId: e.target.value })}>
          <option value="">unbekannt</option>
          {props.zones.map((z) => (
            <option key={z.zoneId} value={z.zoneId}>
              {z.name} — {plants(z.count)}
            </option>
          ))}
        </select>
      </label>
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

function ImageFields({ fields, set }: { fields: WishFields; set: Set }) {
  return (
    <>
      <label>
        Bild-Adresse (https)
        <input
          type="url"
          autoComplete="off"
          maxLength={WISH_LIMITS.imageUrl.max}
          value={fields.imageUrl}
          onChange={(e) => set({ imageUrl: e.target.value })}
        />
      </label>
      <label>
        Bildquelle
        <input
          autoComplete="off"
          maxLength={WISH_LIMITS.imageSource.max}
          value={fields.imageSource}
          onChange={(e) => set({ imageSource: e.target.value })}
        />
      </label>
    </>
  );
}

/** The form to record a wish (FR-WUN-01): only the name is required, the rest stays unknown instead of guessed (P-08). */
export function WishForm(props: {
  zones: readonly ZoneStock[];
  running: boolean;
  message: string | null;
  error: ApiError | null;
  /** Resolves true when the wish was saved, so the form can be emptied. */
  onSend: (input: WishInput) => Promise<boolean>;
}) {
  const [fields, setFields] = useState<WishFields>(EMPTY_FIELDS);
  const [problem, setProblem] = useState<string | null>(null);
  const set: Set = (change) => setFields((f) => ({ ...f, ...change }));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const checked = checkWish(fields);
    setProblem("problem" in checked ? checked.problem : null);
    if ("input" in checked && (await props.onSend(checked.input))) setFields(EMPTY_FIELDS);
  };
  const alert = problem ?? props.error?.text ?? null;
  return (
    <section aria-labelledby="wish-form-title">
      <h2 id="wish-form-title">Wunsch erfassen</h2>
      {props.message && (
        <p role="status" className="hint">
          {props.message}
        </p>
      )}
      {alert && (
        <div role="alert" className="warning">
          <p>{alert}</p>
        </div>
      )}
      <form className="form" onSubmit={(e) => void submit(e)} noValidate>
        <NameFields fields={fields} set={set} />
        <ChoiceFields fields={fields} set={set} zones={props.zones} />
        <ImageFields fields={fields} set={set} />
        <div className="actions">
          <button type="submit" className="primary" disabled={props.running}>
            Wunsch speichern
          </button>
        </div>
      </form>
    </section>
  );
}

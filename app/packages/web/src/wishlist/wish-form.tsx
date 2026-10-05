import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { ZoneStock } from "@pflanzendex/core";
import type { ApiError } from "../kernel";
import {
  checkWish,
  EMPTY_FIELDS,
  FIELD_ORDER,
  fieldsOfRefusal,
  type FieldErrors,
  type WishFields,
} from "./wish-input";
import { ChoiceFields, ImageFields, NameFields, type Set } from "./wish-fields";
import type { WishInput } from "./wishlist-api";

/**
 * Where the refusals show: client checks per field, else what the server refused per field, else (a refusal that names
 * no field) an alert. The first invalid field, or the alert, takes the focus (P-10). A server refusal of a field goes
 * away as soon as that field is edited (`clear`), without moving the focus.
 */
function useRefusals(clientErrors: FieldErrors | null, error: ApiError | null) {
  const alertRef = useRef<HTMLDivElement>(null);
  const [cleared, setCleared] = useState<{ error: ApiError | null; keys: readonly string[] }>({
    error: null,
    keys: [],
  });
  const refused = useMemo(
    () => clientErrors ?? (error ? fieldsOfRefusal(error) : {}),
    [clientErrors, error],
  );
  const errors = useMemo(() => {
    if (clientErrors || cleared.error !== error) return refused;
    return Object.fromEntries(Object.entries(refused).filter(([k]) => !cleared.keys.includes(k)));
  }, [refused, clientErrors, cleared, error]);
  const alertText = !clientErrors && error && Object.keys(refused).length === 0 ? error.text : null;
  // Focus follows the refusal itself, not what is left of it after an edit.
  useEffect(() => {
    const first = FIELD_ORDER.find((k) => refused[k] !== undefined);
    if (first) document.getElementById(`wish-${first}`)?.focus();
    else if (alertText !== null) alertRef.current?.focus();
  }, [refused, alertText, error]);
  const clear = (keys: readonly string[]) =>
    setCleared((c) => ({ error, keys: [...(c.error === error ? c.keys : []), ...keys] }));
  return { errors, alertText, alertRef, clear };
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
  const [clientErrors, setClientErrors] = useState<FieldErrors | null>(null);
  const { errors, alertText, alertRef, clear } = useRefusals(clientErrors, props.error);
  const set: Set = (change) => {
    clear(Object.keys(change));
    setFields((f) => ({ ...f, ...change }));
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const checked = checkWish(fields);
    setClientErrors("errors" in checked ? checked.errors : null);
    if ("input" in checked && (await props.onSend(checked.input))) setFields(EMPTY_FIELDS);
  };
  return (
    <section aria-labelledby="wish-form-title">
      <h2 id="wish-form-title">Wunsch erfassen</h2>
      {props.message && !clientErrors && (
        <p role="status" className="hint">
          {props.message}
        </p>
      )}
      {alertText !== null && (
        <div role="alert" className="warning" tabIndex={-1} ref={alertRef}>
          <p>{alertText}</p>
        </div>
      )}
      <form className="form" onSubmit={(e) => void submit(e)} noValidate>
        <NameFields fields={fields} set={set} errors={errors} />
        <ChoiceFields fields={fields} set={set} errors={errors} zones={props.zones} />
        <ImageFields fields={fields} set={set} errors={errors} />
        <div className="actions">
          <button type="submit" className="primary" disabled={props.running}>
            Wunsch speichern
          </button>
        </div>
      </form>
    </section>
  );
}

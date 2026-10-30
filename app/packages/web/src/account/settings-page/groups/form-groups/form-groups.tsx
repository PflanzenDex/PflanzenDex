import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useState, type ReactNode } from "react";
import { useForm, type Control } from "react-hook-form";
import { Button } from "@/components/ui/button/button";
import { Form, FormRoot } from "@/components/ui/fields/form/form";
import { deviceTimeZone, type ApiError } from "../../../../kernel";
import { ALERT_CLASSES, useServerRefusal } from "../../../refusal";
import {
  profileSchema,
  toProfile,
  toProfileFields,
  type ProfileFields as Fields,
} from "../../../schemas";
import { BufferField, NameFields, ThresholdsField } from "../../../settings-fields/settings-fields";
import type { ProfileSaver } from "../profile-saver";

type Key = "displayName" | "timeZone" | "replenishBuffer" | "positionThresholds";

/**
 * One group of the settings with its own "Speichern" (US-QS-17): the form holds the whole profile, but only the
 * fields of the group are taken over, onto the stored profile (the API saves the profile as a whole). A refusal that
 * names one of the group's fields marks it; any other refusal is an alert (P-10); the input stays.
 */
function GroupForm(props: {
  label: string;
  keys: readonly Key[];
  saver: ProfileSaver;
  fromDevice?: boolean;
  children: (control: Control<Fields>) => ReactNode;
}) {
  const { saver, keys } = props;
  const form = useForm<Fields>({
    resolver: zodResolver(profileSchema),
    defaultValues: toProfileFields(saver.saved, deviceTimeZone()),
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const fieldsOf = useCallback(
    (e: ApiError) => keys.filter((k) => e.details?.some((d) => d.field === k)),
    [keys],
  );
  const { alertText, alertRef } = useServerRefusal<Fields>(error, form.setError, fieldsOf);
  const fromDevice = props.fromDevice === true;

  const send = form.handleSubmit(async (values) => {
    const own = Object.fromEntries(keys.map((k) => [k, values[k]])) as Partial<Fields>;
    const next = toProfile({ ...toProfileFields(saver.saved, null), ...own }, saver.saved);
    const r = await saver.save(next);
    if (!r) return;
    setError(r.ok ? null : r.error);
    setMessage(r.ok ? "Einstellungen gespeichert." : null);
    if (r.ok) form.reset(toProfileFields(r.value, null));
  });

  return (
    <Form {...form}>
      <FormRoot
        aria-label={props.label}
        onSubmit={send}
        onChange={() => setMessage(null)}
        className="flex flex-col gap-4"
      >
        {props.children(form.control)}
        {alertText !== null && (
          <div role="alert" tabIndex={-1} ref={alertRef} className={ALERT_CLASSES}>
            <p>{alertText}</p>
          </div>
        )}
        {message && (
          <p role="status" className="rounded-lg border border-border p-3">
            {message}
          </p>
        )}
        <Button
          type="submit"
          size="touch"
          disabled={saver.saving || !(form.formState.isDirty || fromDevice)}
        >
          {saver.saving ? "Speichert …" : "Speichern"}
        </Button>
      </FormRoot>
    </Form>
  );
}

const PROFILE_KEYS: readonly Key[] = ["displayName", "timeZone"];
const WISHLIST_KEYS: readonly Key[] = ["replenishBuffer"];
const LIGHT_KEYS: readonly Key[] = ["positionThresholds"];

/** Group "Profil": display name and time zone (US-ACC-02); the zone is prefilled from the device until chosen. */
export function ProfileGroup({ saver }: { saver: ProfileSaver }) {
  const fromDevice = saver.saved.timeZone === null;
  return (
    <GroupForm label="Profil" keys={PROFILE_KEYS} saver={saver} fromDevice={fromDevice}>
      {(control) => <NameFields control={control} fromDevice={fromDevice} />}
    </GroupForm>
  );
}

/** Group "Wunschliste": the buffer of the wishlist warning (US-WUN-02). */
export function WishlistGroup({ saver }: { saver: ProfileSaver }) {
  return (
    <GroupForm label="Wunschliste" keys={WISHLIST_KEYS} saver={saver}>
      {(control) => <BufferField control={control} />}
    </GroupForm>
  );
}

/** Group "Licht": the thresholds of the position recommendation (US-LIC-03). */
export function LightGroup({ saver }: { saver: ProfileSaver }) {
  return (
    <GroupForm label="Licht" keys={LIGHT_KEYS} saver={saver}>
      {(control) => <ThresholdsField control={control} />}
    </GroupForm>
  );
}

import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Form, FormRoot } from "@/components/ui/form";
import { LoadFrame, SIGN_IN, deviceTimeZone, setProfileTimeZone, type ApiError } from "../kernel";
import { loadProfile, saveProfile, type AccountProfile } from "./account-api";
import { ALERT_CLASSES, useServerRefusal } from "./refusal";
import { PROFILE_REFUSABLE, profileSchema, toProfile, toProfileFields } from "./schemas";
import type { ProfileFields as Fields } from "./schemas";
import { ProfileFields, SwitchFields } from "./settings-fields";
import { SettingsPageSkeleton } from "./settings-page.skeleton";

type Token = () => Promise<string | undefined>;

/** The form fields a refusal names, in the order of the form: the first one gets the focus. */
const refusedFields = (error: ApiError) => {
  const named = error.details?.map((d) => d.field) ?? [];
  return PROFILE_REFUSABLE.filter((f) => named.includes(f));
};

/** Saves one profile at a time (a double tap sends one); a refusal stays visible and keeps the input (P-10). */
function SettingsForm(props: { api: string; token: Token; profile: AccountProfile }) {
  const [saved, setSaved] = useState(props.profile);
  const fromDevice = saved.timeZone === null;
  const form = useForm<Fields>({
    resolver: zodResolver(profileSchema),
    defaultValues: toProfileFields(props.profile, deviceTimeZone()),
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const busy = useRef(false);
  const { alertText, alertRef } = useServerRefusal<Fields>(error, form.setError, refusedFields);
  const pending = form.formState.isSubmitting;

  const send = form.handleSubmit(async (values) => {
    if (busy.current) return;
    busy.current = true;
    const t = await props.token();
    const r = t
      ? await saveProfile(props.api, t, toProfile(values, saved))
      : { ok: false as const, error: SIGN_IN };
    busy.current = false;
    setError(r.ok ? null : r.error);
    setMessage(r.ok ? "Einstellungen gespeichert." : null);
    if (!r.ok) return;
    setSaved(r.value);
    form.reset(toProfileFields(r.value, null));
    setProfileTimeZone(r.value.timeZone);
  });

  return (
    <Form {...form}>
      <FormRoot
        aria-label="Einstellungen"
        onSubmit={send}
        onChange={() => setMessage(null)}
        className="flex max-w-xl flex-col gap-4"
      >
        <ProfileFields control={form.control} fromDevice={fromDevice} />
        <SwitchFields control={form.control} />
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
          disabled={pending || !(form.formState.isDirty || fromDevice)}
        >
          {pending ? "Speichert …" : "Speichern"}
        </Button>
      </FormRoot>
    </Form>
  );
}

/**
 * Profile and settings (US-ACC-02): display name, time zone (prefilled from the device until chosen), a switch per
 * notification occasion and the two global switches. The page says what happens next (P-09): the hint under the time
 * zone, the confirmation after saving, the refusal with its reason.
 */
export function SettingsPage(props: { api: string; token: Token }) {
  const load = useCallback((t: string) => loadProfile(props.api, t), [props.api]);
  const loading = "Einstellungen werden geladen …";
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <h1 className="text-2xl font-semibold">Einstellungen</h1>
      <LoadFrame
        queryKey={["account", "profile"]}
        fresh
        token={props.token}
        load={load}
        loadingText={loading}
        loadingFallback={<SettingsPageSkeleton label={loading} />}
      >
        {(profile) => <SettingsForm api={props.api} token={props.token} profile={profile} />}
      </LoadFrame>
    </div>
  );
}

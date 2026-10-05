import type { CreatedInvitation, InvitationRecord, InvitationStatus } from "@pflanzendex/core";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRef } from "react";
import { useForm } from "react-hook-form";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { instantText } from "./access-api";
import { TextField } from "./text-field";
import { DAYS, invitationDaysSchema, type InvitationDaysFields } from "./schemas";

const STATUS_TEXT: Record<InvitationStatus, string> = {
  open: "offen",
  redeemed: "eingelöst",
  expired: "abgelaufen",
};

/** The mode in words (not only a switch state) and the one action that changes it. */
export function ModeSection(props: {
  invitationOnly: boolean;
  running: boolean;
  onChange: (invitationOnly: boolean) => void;
}) {
  const { invitationOnly } = props;
  return (
    <section aria-labelledby="mode-title" className="flex flex-col gap-3">
      <h2 id="mode-title" className="text-xl font-semibold">
        Registrierung
      </h2>
      <p>
        Im Moment: <strong>{invitationOnly ? "nur mit Einladungscode" : "offen für alle"}</strong>
      </p>
      <p className="text-sm text-muted-foreground">
        Bestehende Konten melden sich in beiden Fällen wie gewohnt an. Nur neue Personen brauchen
        bei Einladungspflicht einen Code.
      </p>
      <Button
        type="button"
        variant="outline"
        size="touch"
        disabled={props.running}
        onClick={() => props.onChange(!invitationOnly)}
      >
        {invitationOnly ? "Für alle öffnen" : "Nur mit Einladungscode erlauben"}
      </Button>
    </section>
  );
}

/**
 * The days field and the button; a value outside the limits is refused before anything is sent. `focusRef` receives
 * the days field so a neighbour (the empty list) can move the focus there.
 */
export function InvitationForm(props: {
  running: boolean;
  onCreate: (days: number) => void;
  focusRef?: React.MutableRefObject<HTMLInputElement | null>;
}) {
  const form = useForm<InvitationDaysFields>({
    resolver: zodResolver(invitationDaysSchema),
    defaultValues: { days: String(DAYS.default) },
  });
  const submit = form.handleSubmit((v) => props.onCreate(Number(v.days)));
  return (
    <Form {...form}>
      <form noValidate onSubmit={(e) => void submit(e)} className="flex max-w-xl flex-col gap-4">
        <TextField
          control={form.control}
          name="days"
          label="Gültig für (Tage)"
          focusRef={props.focusRef}
          type="number"
          inputMode="numeric"
          min={DAYS.min}
          max={DAYS.max}
        />
        <Button type="submit" size="touch" disabled={props.running}>
          Code erstellen
        </Button>
      </form>
    </Form>
  );
}

/** The days field, the new code and the list: the empty list sends the operator to the field (P-09). */
export function InvitationsArea(props: {
  running: boolean;
  created: CreatedInvitation | null;
  invitations: readonly InvitationRecord[];
  onCreate: (days: number) => void;
}) {
  const field = useRef<HTMLInputElement | null>(null);
  return (
    <>
      <InvitationForm running={props.running} onCreate={props.onCreate} focusRef={field} />
      {props.created && <NewCode created={props.created} />}
      <InvitationList invitations={props.invitations} onStart={() => field.current?.focus()} />
    </>
  );
}

/** The code is shown exactly once; afterwards only its hash exists on the server. */
export function NewCode(props: { created: CreatedInvitation }) {
  const { created } = props;
  return (
    <section
      aria-label="Neuer Einladungscode"
      className="flex flex-col gap-2 rounded-lg border-2 border-primary px-3 py-2"
    >
      <p>
        <code className="select-all text-xl tracking-widest [overflow-wrap:anywhere]">
          {created.code}
        </code>
      </p>
      <p className="rounded-lg border border-border p-3">
        Gültig bis {instantText(created.expiresAt)}. Der Code wird nur jetzt angezeigt: Gib ihn
        weiter oder notiere ihn, später kannst du ihn nicht mehr ansehen.
      </p>
    </section>
  );
}

export function InvitationList(props: {
  invitations: readonly InvitationRecord[];
  onStart: () => void;
}) {
  if (props.invitations.length === 0)
    return (
      <EmptyState
        title="Noch keine Einladung erstellt."
        description="Erstelle oben einen Code."
        action={{ label: "Gültigkeit wählen", onClick: props.onStart }}
      />
    );
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Einladungen">
      {props.invitations.map((i) => (
        <li key={i.id} className="rounded-lg border border-border p-3">
          <strong>{STATUS_TEXT[i.status]}</strong> · erstellt {instantText(i.createdAt)} · gültig
          bis {instantText(i.expiresAt)}
          {i.redeemedAt ? ` · eingelöst ${instantText(i.redeemedAt)}` : ""}
        </li>
      ))}
    </ul>
  );
}

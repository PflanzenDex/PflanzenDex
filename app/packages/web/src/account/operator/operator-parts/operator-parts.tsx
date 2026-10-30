import type { CreatedInvitation, InvitationRecord, InvitationStatus } from "@pflanzendex/core";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronRight } from "lucide-react";
import { useRef } from "react";
import { useForm } from "react-hook-form";
import { useLayer } from "@/components/shared/responsive/layer-sheet/layer-sheet";
import { LAYER_PARAM, Pager } from "@/components/shared/responsive/pager/pager";
import { EmptyState } from "@/components/shared/empty-state/empty-state";
import { Button } from "@/components/ui/button/button";
import { MoreHelp } from "@/components/ui/display/more-help/more-help";
import { Form, FormRoot } from "@/components/ui/fields/form/form";
import { instantText } from "../../api/access-api";
import { BUSY_LOOK } from "../operator-cost/operator-cost";
import { TextField } from "@/components/ui/fields/input/input";
import { DAYS, invitationDaysSchema, type InvitationDaysFields } from "../../schemas";

const STATUS_TEXT: Record<InvitationStatus, string> = {
  open: "offen",
  redeemed: "eingelöst",
  expired: "abgelaufen",
};

/** Invitations per page of the list in its layer (starting value, assumption; US-QS-15). */
export const INVITATIONS_PAGE_SIZE = 5;

/**
 * One topic of the operator area on the overview (US-QS-15): its name, its current value and the layer it opens
 * (`?sheet=<id>`). The value wraps instead of being cut off, so it stays readable at 200 % text.
 */
export function OperatorRow(props: { id: string; title: string; value: string }) {
  const { open, openLayer } = useLayer(props.id);
  return (
    <Button
      type="button"
      variant="ghost"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={(event) => openLayer(event.currentTarget)}
      className="h-auto min-h-12 w-full justify-start gap-3 whitespace-normal px-3 py-2 text-left font-normal"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold">{props.title}</span>
        <span className="block text-sm text-muted-foreground [overflow-wrap:anywhere]">
          {props.value}
        </span>
      </span>
      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
    </Button>
  );
}

/** The mode in words (not only a switch state) and the one action that changes it. The heading is the layer's. */
export function ModeSection(props: {
  invitationOnly: boolean;
  running: boolean;
  onChange: (invitationOnly: boolean) => void;
}) {
  const { invitationOnly } = props;
  return (
    <div className="flex flex-col gap-3">
      <p>
        Im Moment: <strong>{invitationOnly ? "nur mit Einladungscode" : "offen für alle"}</strong>
      </p>
      <MoreHelp more="Nur neue Personen brauchen bei Einladungspflicht einen Code.">
        Bestehende Konten melden sich in beiden Fällen wie gewohnt an.
      </MoreHelp>
      <Button
        type="button"
        variant="outline"
        size="touch"
        aria-disabled={props.running || undefined}
        aria-busy={props.running || undefined}
        className={BUSY_LOOK}
        onClick={() => props.onChange(!invitationOnly)}
      >
        {invitationOnly ? "Für alle öffnen" : "Nur mit Einladungscode erlauben"}
      </Button>
    </div>
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
      <FormRoot onSubmit={submit} className="flex max-w-xl flex-col gap-4">
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
        <Button
          type="submit"
          size="touch"
          aria-disabled={props.running || undefined}
          aria-busy={props.running || undefined}
          className={BUSY_LOOK}
        >
          Code erstellen
        </Button>
      </FormRoot>
    </Form>
  );
}

/** The days field, the new code and the list, all in the layer of the codes: the empty list sends the operator to the field (P-09). */
export function InvitationsArea(props: {
  running: boolean;
  created: CreatedInvitation | null;
  invitations: readonly InvitationRecord[];
  onCreate: (days: number) => void;
}) {
  const field = useRef<HTMLInputElement | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <InvitationForm running={props.running} onCreate={props.onCreate} focusRef={field} />
      {props.created && <NewCode created={props.created} />}
      <InvitationList invitations={props.invitations} onStart={() => field.current?.focus()} />
    </div>
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

/** The invitations in pages of whole entries (`?lpage=n` in the layer, US-QS-15); the newest first, as the server sends them. */
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
    <Pager
      items={props.invitations}
      pageSize={INVITATIONS_PAGE_SIZE}
      label="Einladungen"
      param={LAYER_PARAM}
      replace
      getKey={(i) => i.id}
      renderItem={(i) => (
        <div className="rounded-lg border border-border p-3">
          <strong>{STATUS_TEXT[i.status]}</strong> · erstellt {instantText(i.createdAt)} · gültig
          bis {instantText(i.expiresAt)}
          {i.redeemedAt ? ` · eingelöst ${instantText(i.redeemedAt)}` : ""}
        </div>
      )}
    />
  );
}

import type { CreatedInvitation, InvitationRecord, InvitationStatus } from "@pflanzendex/core";
import { ChevronRight } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { layerOpenerId, useLayer } from "@/shared/patterns/responsive/layer-sheet/use-layer";
import { ScrollEntries } from "@/shared/patterns/responsive/entry-list/paging/scroll-entries/scroll-entries";
import { EmptySection } from "@/shared/patterns/elements/empty-state/empty-section/empty-section";
import { Button } from "@/shared/ui/button";
import { texts } from "@/shared/lib/text-rules/texts";
import { instantText } from "../../api/access-api";
import partsTable from "./operator-parts.de.json";
import { InvitationForm } from "./invitation-form/invitation-form";
import { NewCode } from "./new-code/new-code";

const t = texts(partsTable);

const STATUS_TEXT: Record<InvitationStatus, string> = {
  open: "offen",
  redeemed: "eingelöst",
  expired: "abgelaufen",
};

/** Invitations per page of the list in its layer (starting value, assumption; US-QS-15). */
export const INVITATIONS_PAGE_SIZE = 5;

/**
 * One topic of the operator area on the overview (US-QS-15): its name, its current value and the layer it opens
 * (`?sheet=<id>`). The value wraps instead of being cut off, so it stays readable at 200 % text. A value that loads (the
 * counts of "Löschfristen") is a node, so the row stays the same button while it waits.
 */
export function OperatorRow(props: { id: string; title: string; value: ReactNode }) {
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

/**
 * The plain button under "Kosten pro aktivem Konto" when no figure is entered: it opens the layer that enters one and replaces
 * the sheet "Zahlen" with it (US-QS-15). The sheet's layer id is the opener's id, so Back returns the focus here.
 */
export function EnterCostButton() {
  const { openLayer } = useLayer("kosten");
  return (
    <Button
      id={layerOpenerId("kosten")}
      type="button"
      variant="link"
      aria-haspopup="dialog"
      className="px-0"
      onClick={(event) => openLayer(event.currentTarget)}
    >
      {t("cost.enter")}
    </Button>
  );
}

/** The days field, the new code and the list, all in the layer of the codes: the empty list sends the operator to the field (P-09). */
export function InvitationsArea(props: {
  running: boolean;
  created: CreatedInvitation | null;
  invitations: readonly InvitationRecord[];
  onCreate: (days: number) => Promise<boolean>;
}) {
  const field = useRef<HTMLInputElement | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <InvitationForm running={props.running} onCreate={props.onCreate} focusRef={field} />
      {props.created && <NewCode created={props.created} />}
      <InvitationList invitations={props.invitations} />
    </div>
  );
}

/** The invitations in pages of whole entries (`?lfrom=n` in the layer, US-QS-15); the newest first, as the server sends them. */
export function InvitationList(props: { invitations: readonly InvitationRecord[] }) {
  if (props.invitations.length === 0) return <EmptySection text={t("invitations.none")} />;
  return (
    <ScrollEntries
      items={props.invitations}
      pageSize={INVITATIONS_PAGE_SIZE}
      label="Einladungen"
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

import { EmptyState } from "@/shared/patterns/elements/empty-state/empty-state";
import { LAYER_PARAM, Pager } from "@/shared/patterns/responsive/pager/pager";
import { Button } from "@/shared/ui/button/button";
import { texts } from "@/shared/lib/text-rules/texts";
import type { DeletionEntry } from "../../../api/access-api";
import { BUSY_LOOK } from "../../operator-cost/operator-cost";
import table from "../deletion-section.de.json";

const t = texts(table);

/** Identity removals per page of the list in its layer (starting value, assumption; as the invitations list). */
export const DELETIONS_PAGE_SIZE = 5;

const UTC_FORMAT = new Intl.DateTimeFormat("de-DE", {
  timeZone: "UTC",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** A UTC instant, with its zone named: the operator reads every deadline in UTC (US-ACC-04). */
export const utcText = (iso: string): string => `${UTC_FORMAT.format(new Date(iso))} UTC`;

/** One open item: what it is, its request date and deadline, and for an identity removal when it was completed. */
export function DeletionLine({ entry }: { entry: DeletionEntry }) {
  const dates = entry.completedAt
    ? t("item.completedDates", {
        completed: utcText(entry.completedAt),
        deadline: utcText(entry.deadline),
      })
    : t("item.dates", { requested: utcText(entry.requestedAt), deadline: utcText(entry.deadline) });
  return (
    <>
      <strong className="block">
        {entry.kind === "request" ? t("item.request") : t("item.identity")}
      </strong>
      <span className="block text-sm text-muted-foreground [overflow-wrap:anywhere]">{dates}</span>
    </>
  );
}

/** An open identity removal with its subject: the operator removes the user there, then marks it here. */
function IdentityRow(props: {
  entry: DeletionEntry;
  running: boolean;
  onMark: (id: string) => void;
}) {
  const { entry, running, onMark } = props;
  const id = entry.entryId ?? "";
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <DeletionLine entry={entry} />
      <span className="text-sm [overflow-wrap:anywhere]">
        {t("identity.subject", { subject: entry.subject ?? "" })}
      </span>
      <Button
        type="button"
        size="touch"
        aria-label={t("identity.markFor", { subject: entry.subject ?? "" })}
        aria-disabled={running || undefined}
        aria-busy={running || undefined}
        className={BUSY_LOOK}
        onClick={() => {
          if (!running) onMark(id);
        }}
      >
        {t("identity.mark")}
      </Button>
    </div>
  );
}

/** The identity removals in pages of whole entries (`?lfrom=n` in the layer, as the invitations list does). */
export function IdentityList(props: {
  entries: readonly DeletionEntry[];
  running: boolean;
  onMark: (id: string) => void;
}) {
  if (props.entries.length === 0)
    return (
      <EmptyState title={t("identity.none.title")} description={t("identity.none.description")} />
    );
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">{t("identity.description")}</p>
      <Pager
        items={props.entries}
        pageSize={DELETIONS_PAGE_SIZE}
        label={t("pager.label")}
        param={LAYER_PARAM}
        replace
        getKey={(e) => e.entryId ?? e.requestedAt}
        renderItem={(e) => <IdentityRow entry={e} running={props.running} onMark={props.onMark} />}
      />
    </div>
  );
}

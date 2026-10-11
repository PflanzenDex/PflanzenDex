import type { ReminderRow, ReminderStatus } from "@pflanzendex/core";
import { useCallback } from "react";
import { EmptyState } from "@/components/shared/empty-state/empty-state";
import { LoadFrame } from "../../kernel";
import { loadInbox } from "../api/reminders-api";

const STATUS_TEXT: Record<ReminderStatus, string> = {
  none: "Nichts zu tun",
  pending: "Wird zugestellt",
  in_app: "Nur im Posteingang",
  delivered: "Zugestellt",
  failed: "Zustellung fehlgeschlagen",
};

/** A local calendar date `YYYY-MM-DD` as text; read as UTC so the zone of the device never shifts the day (NFR-08). */
const dayText = (localDate: string) =>
  new Intl.DateTimeFormat("de-DE", { dateStyle: "full", timeZone: "UTC" }).format(
    new Date(`${localDate}T00:00:00Z`),
  );

function Reminder({ row }: { row: ReminderRow }) {
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="m-0 text-base font-semibold">{dayText(row.localDate)}</h4>
        <span className="text-sm text-muted-foreground">{STATUS_TEXT[row.status]}</span>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {row.items.map((item) => (
          <li key={item.id}>
            <p className="m-0">{item.text}</p>
            <p className="m-0 text-sm text-muted-foreground">{item.nextAction}</p>
          </li>
        ))}
      </ul>
      {row.status === "failed" && (
        <p className="m-0 text-sm">
          Die Erinnerung steht hier, weil der Versand nicht geklappt hat. Die Aufgaben findest du
          auch in der Heute-Liste.
        </p>
      )}
    </li>
  );
}

/**
 * The inbox of reminders (US-MON-01): the bundled message of each day on which something needed action, newest first.
 * Without a push channel this is where a reminder lives; a failed delivery stays visible (P-10) and says where to go on (P-09).
 */
export function Inbox(props: { api: string; token: () => Promise<string | undefined> }) {
  const load = useCallback((t: string) => loadInbox(props.api, t), [props.api]);
  return (
    <LoadFrame
      queryKey={["monitoring", "inbox"]}
      token={props.token}
      load={load}
      loadingText="Erinnerungen werden geladen …"
    >
      {(rows) =>
        rows.length === 0 ? (
          <EmptyState
            level={3}
            title="Keine Erinnerungen"
            description="Es gibt nichts zu erinnern. Sobald etwas fällig wird, steht es hier und in der Heute-Liste."
          />
        ) : (
          <ul aria-label="Erinnerungen" className="m-0 flex list-none flex-col gap-3 p-0">
            {rows.map((row) => (
              <Reminder key={row.id} row={row} />
            ))}
          </ul>
        )
      }
    </LoadFrame>
  );
}

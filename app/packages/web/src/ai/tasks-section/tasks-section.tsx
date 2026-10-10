import { useCallback, useState } from "react";
import { NewTask } from "./new-task/new-task";
import { Button } from "@/components/ui/button/button";
import { copyText } from "@/platform/clipboard";
import { LoadFrame, useInvalidate, useWriteAction } from "../../kernel";
import { cancelTask, loadTasks, type AiTaskRow } from "../api/connections-api";

type Token = () => Promise<string | undefined>;
const KEY = ["ai", "tasks"] as const;

const STATUS_TEXT: Record<AiTaskRow["status"], string> = {
  open: "Offen",
  in_progress: "In Arbeit",
  done: "Erledigt",
  declined: "Abgelehnt",
  expired: "Abgelaufen",
};

function Task(props: {
  row: AiTaskRow;
  busy: boolean;
  onCopy: (text: string) => void;
  onCancel: () => void;
}) {
  const { row } = props;
  const name = `${row.title}: ${row.label}`;
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <strong className="break-all">{name}</strong>
        <span>{STATUS_TEXT[row.status]}</span>
      </div>
      {row.status === "in_progress" && row.clientName && (
        <p className="m-0 text-sm text-muted-foreground">{row.clientName} arbeitet daran.</p>
      )}
      {row.status === "done" && (
        <p className="m-0 text-sm text-muted-foreground">
          Das Ergebnis liegt unter „Entwürfe“ zur Prüfung.
        </p>
      )}
      {row.prompt && (
        <>
          <details>
            <summary className="cursor-pointer">Text des Auftrags ansehen</summary>
            <pre className="m-0 mt-2 whitespace-pre-wrap break-words text-sm">{row.prompt}</pre>
          </details>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              aria-label={`${name} in KI-Client öffnen`}
              onClick={() => props.onCopy(row.prompt ?? "")}
            >
              In KI-Client öffnen
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={props.busy}
              aria-label={`${name} zurückziehen`}
              onClick={props.onCancel}
            >
              Zurückziehen
            </Button>
          </div>
        </>
      )}
    </li>
  );
}

function List(props: {
  api: string;
  token: Token;
  connected: boolean;
  rows: readonly AiTaskRow[];
}) {
  const again = useInvalidate(KEY);
  const write = useWriteAction(props.token, again);
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (text: string) =>
    setCopied(
      (await copyText(text))
        ? "Der Auftrag liegt in der Zwischenablage. Füge ihn in deinen KI-Client ein."
        : "Das Kopieren ging nicht. Öffne „Text des Auftrags ansehen“ und kopiere ihn selbst.",
    );
  return (
    <div className="flex max-w-xl flex-col gap-3">
      <p className="m-0 text-sm text-muted-foreground">
        Ein Auftrag bittet deinen KI-Client um etwas, zum Beispiel ein Artprofil. Das Ergebnis kommt
        als Entwurf und zählt erst, wenn du es übernimmst. Offene Aufträge verfallen nach 14 Tagen.
      </p>
      <NewTask api={props.api} token={props.token} connected={props.connected} onCreated={again} />
      {props.rows.length === 0 ? (
        <p className="m-0">Keine Aufträge vorhanden.</p>
      ) : (
        <ul aria-label="KI-Aufträge" className="m-0 flex list-none flex-col gap-2 p-0">
          {props.rows.map((row) => (
            <Task
              key={row.id}
              row={row}
              busy={write.running}
              onCopy={(t) => void copy(t)}
              onCancel={() =>
                void write.run(
                  (t) => cancelTask(props.api, t, row.id),
                  "Der Auftrag ist zurückgezogen.",
                )
              }
            />
          ))}
        </ul>
      )}
      {write.error && (
        <p role="alert" className="rounded-lg border border-destructive p-3">
          {write.error.text}
        </p>
      )}
      {(write.message ?? copied) && (
        <p role="status" className="rounded-lg border border-border p-3">
          {write.message ?? copied}
        </p>
      )}
    </div>
  );
}

/** Tasks from the app to the AI client (US-KI-08): create, see the status, open in the client, copy as text. */
export function TasksSection(props: { api: string; token: Token }) {
  const load = useCallback((t: string) => loadTasks(props.api, t), [props.api]);
  return (
    <LoadFrame
      queryKey={KEY}
      token={props.token}
      load={load}
      loadingText="Aufträge werden geladen …"
    >
      {(data) => (
        <List
          api={props.api}
          token={props.token}
          connected={data.clientConnected}
          rows={data.tasks}
        />
      )}
    </LoadFrame>
  );
}

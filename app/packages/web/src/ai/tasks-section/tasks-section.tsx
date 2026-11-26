import { useCallback, useState } from "react";
import { NewTask } from "./new-task/new-task";
import { Button } from "@/shared/ui/button";
import { MoreHelp } from "@/shared/ui/more-help";
import { LAYER_PARAM, Pager } from "@/shared/patterns/responsive/pager/pager";
import { copyText } from "@/shared/platform/browser/clipboard";
import { entityKey, useInvalidate, useWriteAction } from "../../shared/data";
import { LoadFrame } from "@/shared/patterns/states/request-state/load-frame/load-frame";
import { cancelTask, loadTasks, type AiTaskRow } from "../api/connections-api";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "../ai.de.json";
import { NewTaskSkeleton, TasksSkeleton } from "./tasks-section.skeleton";
import { WriteNotes } from "../write-notes/write-notes";
import { DisclosureSummary } from "@/shared/ui/more-help.disclosure-summary";
import {
  EmptySheet,
  HOWTO_LAYER,
  NEW_TASK_LAYER,
} from "../clients-section/connect-step/connect-step";

const ui = texts(table);

type Token = () => Promise<string | undefined>;
const KEY = ["ai", "tasks"] as const;
/** Tasks per page inside the layer (starting value, assumption; US-QS-15). */
const PAGE = 2;

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
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
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
            <DisclosureSummary>Text des Auftrags ansehen</DisclosureSummary>
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
              variant="plain"
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
    </div>
  );
}

/** No task yet (FX-81): a new task when a client is connected, else the step to connect one. */
function NoTasks({ clientConnected }: { clientConnected: boolean }) {
  return (
    <EmptySheet
      title="Keine Aufträge vorhanden"
      layer={clientConnected ? NEW_TASK_LAYER : HOWTO_LAYER}
      label={ui(clientConnected ? "step.newTask" : "step.connect")}
    />
  );
}

function List(props: {
  api: string;
  token: Token;
  rows: readonly AiTaskRow[];
  clientConnected: boolean;
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
    <div className="flex min-w-0 max-w-xl flex-col gap-3">
      <MoreHelp more={ui("tasks.more")}>Ein Auftrag bittet deinen KI-Client um etwas.</MoreHelp>
      {props.rows.length === 0 ? (
        <NoTasks clientConnected={props.clientConnected} />
      ) : (
        <Pager
          items={props.rows}
          pageSize={PAGE}
          label="KI-Aufträge"
          param={LAYER_PARAM}
          getKey={(row) => row.id}
          renderItem={(row) => (
            <Task
              row={row}
              busy={write.running}
              onCopy={(t) => void copy(t)}
              onCancel={() =>
                void write.run(
                  (t, opts) => cancelTask(props.api, t, row.id, opts),
                  "Der Auftrag ist zurückgezogen.",
                  entityKey("task", row.id, "cancel"),
                )
              }
            />
          )}
        />
      )}
      <WriteNotes error={write.error} status={write.message ?? copied} />
    </div>
  );
}

/** Tasks from the app to the AI client (US-KI-08): see the status, open in the client, copy as text, withdraw. */
export function TasksSection(props: { api: string; token: Token }) {
  const load = useCallback((t: string) => loadTasks(props.api, t), [props.api]);
  return (
    <LoadFrame
      queryKey={KEY}
      token={props.token}
      load={load}
      loadingText={ui("tasks.loading")}
      loadingFallback={<TasksSkeleton label={ui("tasks.loading")} />}
    >
      {(data) => (
        <List
          api={props.api}
          token={props.token}
          rows={data.tasks}
          clientConnected={data.clientConnected}
        />
      )}
    </LoadFrame>
  );
}

/** The form for a new task (US-KI-08) in its own layer: it needs to know whether a client is connected. */
export function NewTaskPart(props: { api: string; token: Token }) {
  const load = useCallback((t: string) => loadTasks(props.api, t), [props.api]);
  const again = useInvalidate(KEY);
  return (
    <LoadFrame
      queryKey={KEY}
      token={props.token}
      load={load}
      loadingText={ui("tasks.loading")}
      loadingFallback={<NewTaskSkeleton label={ui("tasks.loading")} />}
    >
      {(data) => (
        <NewTask
          api={props.api}
          token={props.token}
          connected={data.clientConnected}
          onCreated={again}
        />
      )}
    </LoadFrame>
  );
}

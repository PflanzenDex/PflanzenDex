import { useCallback } from "react";
import type { AiConnection, AiRights } from "@pflanzendex/core";
import { Button } from "@/components/ui/button/button";
import { HowTo } from "./how-to/how-to";
import { Select } from "@/components/ui/fields/select/select";
import { LoadFrame, useInvalidate, useWriteAction } from "../../kernel";
import { allowAgain, loadConnections, revokeConnection, setRights } from "../api/connections-api";

type Token = () => Promise<string | undefined>;
const KEY = ["ai", "connections"] as const;

const RIGHTS_TEXT: Record<AiRights, string> = {
  read: "Lesen",
  drafts: "Lesen und Entwürfe anlegen",
  write: "Lesen, Entwürfe anlegen und Umkehrbares schreiben",
};
const SHORT: Record<AiRights, string> = { read: "Lesen", drafts: "Entwürfe", write: "Schreiben" };

const when = (iso: string) =>
  new Date(iso).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });

type Run = ReturnType<typeof useWriteAction>["run"];
interface RowProps {
  api: string;
  row: AiConnection;
  busy: boolean;
  run: Run;
}

/** A request for a higher right: only the keeper's tap allows it (step-up, never silently). */
function Request({ api, row, busy, run }: RowProps) {
  const wanted = row.requestedRights;
  if (!wanted) return null;
  return (
    <div
      role="group"
      aria-label={`Anfrage von ${row.clientName}`}
      className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2"
    >
      <span>
        {row.clientName} fragt nach dem Recht „{SHORT[wanted]}“.
      </span>
      <Button
        size="sm"
        disabled={busy}
        aria-label={`Recht „${SHORT[wanted]}“ für ${row.clientName} erlauben`}
        onClick={() => void run((t) => setRights(api, t, row.id, wanted), "Das Recht ist erlaubt.")}
      >
        Erlauben
      </Button>
    </div>
  );
}

function Controls({ api, row, busy, run }: RowProps) {
  const name = row.clientName;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2">
        <span>Recht</span>
        <Select
          value={row.rights}
          disabled={busy}
          aria-label={`Recht für ${name}`}
          onChange={(e) => {
            const rights = e.target.value as AiRights;
            void run((t) => setRights(api, t, row.id, rights), "Das Recht ist geändert.");
          }}
        >
          <option value="read">{RIGHTS_TEXT.read}</option>
          <option value="drafts">{RIGHTS_TEXT.drafts}</option>
          <option value="write">{RIGHTS_TEXT.write}</option>
        </Select>
      </label>
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        aria-label={`${name} trennen`}
        onClick={() =>
          void run((t) => revokeConnection(api, t, row.id), "Der KI-Client ist getrennt.")
        }
      >
        Trennen
      </Button>
    </div>
  );
}

function Connection(props: RowProps) {
  const { api, row, run, busy } = props;
  const name = row.clientName;
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <strong className="break-all">{name}</strong>
        <span>
          {row.revokedAt ? `Getrennt am ${when(row.revokedAt)}` : RIGHTS_TEXT[row.rights]}
        </span>
      </div>
      <p className="m-0 text-sm text-muted-foreground">
        Verbunden seit {when(row.createdAt)}.{" "}
        {row.lastUse ? `Zuletzt genutzt: ${when(row.lastUse)}.` : "Noch nicht genutzt."}
      </p>
      {row.revokedAt ? (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          disabled={busy}
          aria-label={`${name} wieder zulassen`}
          onClick={() =>
            void run((t) => allowAgain(api, t, row.id), "Der KI-Client ist wieder zugelassen.")
          }
        >
          Wieder zulassen
        </Button>
      ) : (
        <>
          <Request {...props} />
          <Controls {...props} />
        </>
      )}
    </li>
  );
}

function List(props: { api: string; token: Token; rows: readonly AiConnection[] }) {
  const again = useInvalidate(KEY);
  const write = useWriteAction(props.token, again);
  return (
    <div className="flex max-w-xl flex-col gap-3">
      <p className="m-0 text-sm text-muted-foreground">
        Dein KI-Client (zum Beispiel Claude oder ChatGPT) kann sich über eine offene Schnittstelle
        mit deinem Konto verbinden. Er sieht nur deine eigenen Daten, nie die von Freunden. Der
        Anbieter deines KI-Clients erhält die Daten, die dein Client abruft; die App selbst sendet
        nichts an einen KI-Dienst. Ohne KI-Client funktioniert alles weiter wie bisher.
      </p>
      <HowTo address={`${props.api.replace(/\/$/, "")}/mcp`} />
      {props.rows.length === 0 ? (
        <p className="m-0">Noch ist kein KI-Client verbunden.</p>
      ) : (
        <ul aria-label="Verbundene KI-Clients" className="m-0 flex list-none flex-col gap-2 p-0">
          {props.rows.map((row) => (
            <Connection
              key={row.id}
              api={props.api}
              row={row}
              busy={write.running}
              run={write.run}
            />
          ))}
        </ul>
      )}
      {write.error && (
        <p role="alert" className="rounded-lg border border-destructive p-3">
          {write.error.text}
        </p>
      )}
      {write.message && (
        <p role="status" className="rounded-lg border border-border p-3">
          {write.message}
        </p>
      )}
    </div>
  );
}

/**
 * The connected AI clients of the account (US-KI-07): how to connect one, name, rights, since and last use, the change
 * of the rights (also the confirmation of a request for a higher right), the revocation and "allow again". The
 * disclosure of where the data goes is part of it (US-KI-06).
 */
export function AiClientsSection(props: { api: string; token: Token }) {
  const load = useCallback((t: string) => loadConnections(props.api, t), [props.api]);
  return (
    <LoadFrame
      queryKey={KEY}
      token={props.token}
      load={load}
      loadingText="Verbundene KI-Clients werden geladen …"
    >
      {(rows) => <List api={props.api} token={props.token} rows={rows} />}
    </LoadFrame>
  );
}

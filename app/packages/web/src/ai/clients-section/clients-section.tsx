import { useCallback } from "react";
import type { AiConnection, AiRights } from "@pflanzendex/core";
import { Button } from "@/shared/ui/button/button";
import { MoreHelp } from "@/shared/ui/display/more-help/more-help";
import { Select } from "@/shared/ui/fields/select/select";
import { LAYER_PARAM, Pager } from "@/shared/patterns/responsive/pager/pager";
import { LoadFrame, useInvalidate, useWriteAction } from "../../shared/data";
import { allowAgain, loadConnections, revokeConnection, setRights } from "../api/connections-api";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "../ai.de.json";
import { ClientsSkeleton } from "./clients-section.skeleton";

/** The write of one right of a connection, sent with the key of its action (US-QS-03). */
const sendRights = (api: string, id: string, rights: AiRights) => (t: string, key: string) =>
  setRights(api, t, { id, rights }, { key });

const ui = texts(table);

type Token = () => Promise<string | undefined>;
const KEY = ["ai", "connections"] as const;
/** Connected clients per page inside the layer (starting value, assumption; US-QS-15). */
const PAGE = 2;

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
        onClick={() => void run(sendRights(api, row.id, wanted), "Das Recht ist erlaubt.")}
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
            void run(sendRights(api, row.id, rights), "Das Recht ist geändert.");
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
          void run(
            (t, key) => revokeConnection(api, t, row.id, { key }),
            "Der KI-Client ist getrennt.",
          )
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
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
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
            void run(
              (t, key) => allowAgain(api, t, row.id, { key }),
              "Der KI-Client ist wieder zugelassen.",
            )
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
    </div>
  );
}

function List(props: { api: string; token: Token; rows: readonly AiConnection[] }) {
  const again = useInvalidate(KEY);
  const write = useWriteAction(props.token, again);
  return (
    <div className="flex min-w-0 max-w-xl flex-col gap-3">
      <MoreHelp more="Dein KI-Client (zum Beispiel Claude oder ChatGPT) kann sich über eine offene Schnittstelle mit deinem Konto verbinden. Er sieht nur deine eigenen Daten, nie die von Freunden. Der Anbieter deines KI-Clients erhält die Daten, die dein Client abruft; die App selbst sendet nichts an einen KI-Dienst. Ohne KI-Client funktioniert alles weiter wie bisher.">
        Er sieht nur deine eigenen Daten, nie die von Freunden.
      </MoreHelp>
      {props.rows.length === 0 ? (
        <p className="m-0">Noch ist kein KI-Client verbunden.</p>
      ) : (
        <Pager
          items={props.rows}
          pageSize={PAGE}
          label="Verbundene KI-Clients"
          param={LAYER_PARAM}
          getKey={(row) => row.id}
          renderItem={(row) => (
            <Connection api={props.api} row={row} busy={write.running} run={write.run} />
          )}
        />
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
 * The connected AI clients of the account (US-KI-07): name, rights, since and last use, the change of the rights (also
 * the confirmation of a request for a higher right), the revocation and "allow again", in pages of whole clients. The
 * disclosure of where the data goes is part of it (US-KI-06); how to connect one is its own layer of "KI-Clients".
 */
export function AiClientsSection(props: { api: string; token: Token }) {
  const load = useCallback((t: string) => loadConnections(props.api, t), [props.api]);
  return (
    <LoadFrame
      queryKey={KEY}
      token={props.token}
      load={load}
      loadingText={ui("clients.loading")}
      loadingFallback={<ClientsSkeleton label={ui("clients.loading")} />}
    >
      {(rows) => <List api={props.api} token={props.token} rows={rows} />}
    </LoadFrame>
  );
}

import { useCallback } from "react";
import type { AiConnection, AiRights } from "@pflanzendex/core";
import { Button } from "@/shared/ui/button";
import { MoreHelp } from "@/shared/ui/more-help";
import { Select } from "@/shared/ui/select";
import { ScrollEntries } from "@/shared/patterns/responsive/pager/paging/scroll-entries/scroll-entries";
import { entityKey, useInvalidate, useWriteAction } from "../../shared/data";
import { LoadFrame } from "@/shared/patterns/states/request-state/load-frame/load-frame";
import { allowAgain, loadConnections, revokeConnection, setRights } from "../api/connections-api";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "../ai.de.json";
import { ClientsSkeleton } from "./clients-section.skeleton";
import { EmptySheet, HOWTO_LAYER } from "./connect-step/connect-step";
import { WriteNotes } from "../write-notes/write-notes";

const ui = texts(table);

type Token = () => Promise<string | undefined>;
const KEY = ["ai", "connections"] as const;
/** Connected clients per page inside the layer (starting value, assumption; US-QS-15). */
const PAGE = 2;

const SHORT: Record<AiRights, string> = { read: "Lesen", drafts: "Entwürfe", write: "Schreiben" };

const when = (iso: string) =>
  new Date(iso).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
type Run = ReturnType<typeof useWriteAction>["run"];
type RowProps = { api: string; row: AiConnection; busy: boolean; run: Run };

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
        onClick={() =>
          void run(
            (t, o) => setRights(api, t, { id: row.id, rights: wanted }, o),
            "Das Recht ist erlaubt.",
            entityKey("client", row.id, `rights:${wanted}`),
          )
        }
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
            void run(
              (t, o) => setRights(api, t, { id: row.id, rights }, o),
              "Das Recht ist geändert.",
              entityKey("client", row.id, `rights:${rights}`),
            );
          }}
        >
          <option value="read">{ui("rights.read")}</option>
          <option value="drafts">{ui("rights.drafts")}</option>
          <option value="write">{ui("rights.write")}</option>
        </Select>
      </label>
      <Button
        variant="tinted"
        size="sm"
        disabled={busy}
        aria-label={`${name} trennen`}
        onClick={() =>
          void run(
            (t, o) => revokeConnection(api, t, row.id, o),
            "Der KI-Client ist getrennt.",
            entityKey("client", row.id, "revoke"),
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
          {row.revokedAt ? `Getrennt am ${when(row.revokedAt)}` : ui(`rights.${row.rights}`)}
        </span>
      </div>
      <p className="m-0 text-sm text-muted-foreground">
        Verbunden seit {when(row.createdAt)}.{" "}
        {row.lastUse ? `Zuletzt genutzt: ${when(row.lastUse)}.` : "Noch nicht genutzt."}
      </p>
      {row.revokedAt ? (
        <Button
          variant="tinted"
          size="sm"
          className="self-start"
          disabled={busy}
          aria-label={`${name} wieder zulassen`}
          onClick={() =>
            void run(
              (t, o) => allowAgain(api, t, row.id, o),
              "Der KI-Client ist wieder zugelassen.",
              entityKey("client", row.id, "allow-again"),
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
      <MoreHelp more={ui("clients.more")}>Ein KI-Client sieht nur deine eigenen Daten.</MoreHelp>
      {props.rows.length === 0 ? (
        <EmptySheet
          title="Noch ist kein KI-Client verbunden"
          layer={HOWTO_LAYER}
          label={ui("step.connect")}
        />
      ) : (
        <ScrollEntries
          items={props.rows}
          pageSize={PAGE}
          label="Verbundene KI-Clients"
          getKey={(row) => row.id}
          renderItem={(row) => (
            <Connection api={props.api} row={row} busy={write.running} run={write.run} />
          )}
        />
      )}
      <WriteNotes error={write.error} status={write.message} />
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

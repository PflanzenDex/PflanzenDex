import { useCallback, useEffect } from "react";
import { Link, useSearchParams } from "react-router";
import type { DifficultyOverview, DifficultyRow } from "@pflanzendex/core";
import { EmptyState } from "@/components/shared/empty-state/empty-state";
import { profileAddress } from "@/components/shared/navigation/nav-model/navigation/navigation";
import { LayerSheet, useLayer } from "@/components/shared/responsive/layer-sheet/layer-sheet";
import { Pager } from "@/components/shared/responsive/pager/pager";
import { useRowPageSize } from "@/components/shared/responsive/pager/row-page-size";
import {
  FactGrid,
  unknownInEvery,
} from "@/components/shared/responsive/responsive-table/fact-grid/fact-grid";
import { Button } from "@/components/ui/button/button";
import { LoadFrame } from "../../../kernel";
import { loadDifficulty } from "../../insights/api/difficulty-api";
import { DifficultyPageSkeleton } from "./difficulty-page.skeleton";
import { PageFrame, Plain, Quiet, TITLE } from "../../specimens/cards/parts/parts";
import { ENTRY_FACTS, entryLine, factsOf } from "./difficulty-page.values";

/** The layer of one species of the comparison: `?sheet=compare-<id>` (US-QS-22). */
const layerId = (r: DifficultyRow): string => `compare-${r.speciesId}`;

/** Set when a destination shows this page below its own title (US-QS-14). */
type Host = { onCaption: (text: string | null) => void };

/** Tells the host the count line of the loaded comparison and takes it back when the page goes away (US-QS-14). */
function ReportCaption({ host, count }: { host: Host | undefined; count: number }) {
  useEffect(() => {
    host?.onCaption(count === 1 ? "1 Art im Vergleich" : `${count} Arten im Vergleich`);
    return () => host?.onCaption(null);
  }, [host, count]);
  return null;
}

/**
 * Species with an active specimen side by side, easiest first (US-BES-05); a missing value folds into a count with its next step (P-08, US-QS-24).
 * The destination "Sammlung" shows it below its title as an arrangement of the species (US-QS-14): `host` drops the
 * card frame and the main heading, the section name stays for screen readers.
 */
export function DifficultyPage(props: {
  api: string;
  token: () => Promise<string | undefined>;
  host?: Host;
}) {
  const { api, token, host } = props;
  const load = useCallback((t: string) => loadDifficulty(api, t), [api]);
  const Frame = host ? Plain : PageFrame;
  return (
    <Frame>
      <LoadFrame
        queryKey={["collection", "difficulty"]}
        token={token}
        load={load}
        loadingText="Artenvergleich wird geladen …"
        {...(host ? {} : { heading: "Artenvergleich" })}
        loadingFallback={<DifficultyPageSkeleton label="Artenvergleich wird geladen …" />}
      >
        {({ rows, unreadable }: DifficultyOverview) => (
          <>
            <ReportCaption host={host} count={rows.length} />
            <DifficultyTable rows={rows} unreadable={unreadable} host={host !== undefined} />
          </>
        )}
      </LoadFrame>
    </Frame>
  );
}

/** Species the account can no longer read have no row; the page says how many are missing (P-10). */
function UnreadableNote({ count }: { count: number }) {
  if (count === 0) return null;
  const species = count === 1 ? "1 Art" : `${count} Arten`;
  return (
    <Quiet>
      {`${species} deiner Pflanzen kannst du nicht mehr lesen; sie fehlen in diesem Vergleich.`}
    </Quiet>
  );
}

function Entry({ row, hidden }: { row: DifficultyRow; hidden: readonly string[] }) {
  const { openLayer, open } = useLayer(layerId(row));
  return (
    <Button
      type="button"
      variant="outline"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={`Vergleichswerte: ${row.speciesName}`}
      className="h-auto w-full justify-between gap-2 whitespace-normal px-3 py-2 text-left"
      onClick={(event) => openLayer(event.currentTarget)}
    >
      <span className="grid min-w-0 gap-0 break-words">
        <span className="font-semibold">{row.speciesName}</span>
        <span className="text-sm font-normal text-muted-foreground">{entryLine(row, hidden)}</span>
      </span>
      <span className="text-2xl leading-none text-muted-foreground" aria-hidden="true">
        ›
      </span>
    </Button>
  );
}

/** All values of one species; the unknown ones fold into one line with the next step (US-QS-24). */
function Values({ row }: { row: DifficultyRow }) {
  return (
    <FactGrid
      facts={factsOf(row)}
      next={
        <Button asChild variant="outline" size="sm">
          <Link to={profileAddress(row.speciesId)}>Artprofil öffnen</Link>
        </Button>
      }
    />
  );
}

function DifficultyTable(props: {
  rows: readonly DifficultyRow[];
  unreadable: number;
  host: boolean;
}) {
  const { rows, host } = props;
  const size = useRowPageSize();
  const [params] = useSearchParams();
  const chosen = rows.find((r) => layerId(r) === params.get("sheet"));
  const hidden = unknownInEvery(rows, ENTRY_FACTS);
  return (
    <section aria-labelledby="difficulty-title" className="flex min-w-0 flex-col gap-2">
      {host ? (
        <h2 id="difficulty-title" className="sr-only">
          Artenvergleich
        </h2>
      ) : (
        <h1 id="difficulty-title" className={TITLE}>
          Artenvergleich
        </h1>
      )}
      <UnreadableNote count={props.unreadable} />
      {rows.length === 0 ? (
        <EmptyState
          title="Noch keine Art mit aktiver Pflanze"
          description="Lege in der Sammlung eine Pflanze an, dann erscheint ihre Art hier."
          action={{ label: "Pflanze anlegen", href: "/collection" }}
        />
      ) : (
        <>
          <Quiet>Deine Arten nach Schwierigkeit, die leichtesten zuerst.</Quiet>
          {hidden.length > 0 ? (
            <Quiet>{`Bei keiner Art angegeben, deshalb nicht in der Liste: ${hidden.join(", ")}.`}</Quiet>
          ) : null}
          <Pager
            items={rows}
            pageSize={size}
            label="Artenvergleich"
            getKey={(r) => r.speciesId}
            listClassName="md:grid md:grid-cols-2"
            renderItem={(r) => <Entry row={r} hidden={hidden} />}
          />
        </>
      )}
      {chosen ? (
        <LayerSheet id={layerId(chosen)} title={chosen.speciesName}>
          <Values row={chosen} />
        </LayerSheet>
      ) : null}
    </section>
  );
}

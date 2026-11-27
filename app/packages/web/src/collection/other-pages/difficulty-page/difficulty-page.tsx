import { useCallback, useEffect } from "react";
import { Link, useSearchParams } from "react-router";
import { ChevronRight } from "lucide-react";
import type { DifficultyOverview, DifficultyRow } from "@pflanzendex/core";
import { EmptyState } from "@/shared/patterns/elements/empty-state/empty-state";
import { profileAddress } from "@/shared/patterns/navigation/navigation/navigation";
import {
  LayerSheet,
  useExitValue,
  useLayer,
} from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { ScrollEntries } from "@/shared/patterns/responsive/entry-list/paging/scroll-entries/scroll-entries";
import { useRowPageSize } from "@/shared/patterns/responsive/entry-list/row-page-size";
import {
  FactGrid,
  unknownInEvery,
} from "@/shared/patterns/responsive/responsive-table/fact-grid/fact-grid";
import { Button } from "@/shared/ui/button";
import { ROW_GROUP } from "@/shared/lists/grouped-list/group-classes";
import { SpeciesName, germanNameOf } from "@/shared/species-name/species-name";
import { LightNeedAction } from "@/light";
import { LoadFrame } from "@/shared/patterns/states/request-state/load-frame/load-frame";
import { loadDifficulty } from "../../insights/api/difficulty-api";
import { DifficultyPageSkeleton } from "./difficulty-page.skeleton";
import { PageFrame, Plain, Quiet } from "../../specimens/cards/parts/parts";
import { ENTRY_FACTS, entryLine, factsOf, missingValuesText } from "./difficulty-page.values";
import { PageHeader } from "@/shared/patterns/navigation/page-header/page-header";

/** A species row of the grouped list (US-QS-32, SG-COLOR-02): neutral, with the hover of the grouped rows and the chevron. */
const ENTRY_ROW =
  "whitespace-normal text-foreground hover:bg-muted hover:text-foreground focus-visible:ring-inset focus-visible:ring-offset-0";

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
    <Frame className="flex min-h-0 flex-1 flex-col">
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
  // The label holds the row's visible text in its order: the title, then the meta line (WCAG 2.5.3, US-QS-32).
  const german = germanNameOf(row.botanicalName, row.speciesName);
  const line = entryLine(row, hidden);
  const meta = [german === null ? null : row.botanicalName, line].filter(Boolean).join(" · ");
  const named = [german ?? row.botanicalName, meta].filter(Boolean).join(" ");
  return (
    <Button
      type="button"
      variant="ghost"
      size="row"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={`Vergleichswerte: ${named}`}
      className={ENTRY_ROW}
      onClick={(event) => openLayer(event.currentTarget)}
    >
      <span className="grid min-w-0 flex-1 gap-0 break-words">
        {/* `speciesName` is the German name, or the botanical name where there is none: SpeciesName takes that as none (US-QS-32, F-0121). */}
        <SpeciesName scientific={row.botanicalName} german={row.speciesName} meta={line} />
      </span>
      <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
    </Button>
  );
}

/**
 * All values of one species; the unknown ones fold into one line with the next step (US-QS-24). An unknown light need
 * names "Lichtbedarf eintragen" instead of the profile (US-LIC-01, P-09).
 */
function Values({ row }: { row: DifficultyRow }) {
  return (
    <FactGrid
      facts={factsOf(row)}
      countText={missingValuesText}
      next={
        row.lightNeedUnknown ? (
          <LightNeedAction speciesId={row.speciesId} speciesName={row.speciesName} />
        ) : (
          <Button asChild variant="tinted" size="sm">
            <Link to={profileAddress(row.speciesId)}>Artprofil öffnen</Link>
          </Button>
        )
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
  // The comparison layer keeps its species while it slides out: the address has lost it at once (US-QS-15, F12).
  const shown = useExitValue(chosen);
  const hidden = unknownInEvery(rows, ENTRY_FACTS);
  return (
    <section
      aria-labelledby="difficulty-title"
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-2"
    >
      {host ? (
        <h2 id="difficulty-title" className="sr-only">
          Artenvergleich
        </h2>
      ) : (
        <PageHeader headingId="difficulty-title" title="Artenvergleich" />
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
          <ScrollEntries
            items={rows}
            pageSize={size}
            fit
            label="Artenvergleich"
            getKey={(r) => r.speciesId}
            listClassName={`${ROW_GROUP} [&>li]:shrink-0`}
            renderItem={(r) => <Entry row={r} hidden={hidden} />}
          />
        </>
      )}
      {shown ? (
        <LayerSheet id={layerId(shown)} title={shown.speciesName}>
          <Values row={shown} />
        </LayerSheet>
      ) : null}
    </section>
  );
}

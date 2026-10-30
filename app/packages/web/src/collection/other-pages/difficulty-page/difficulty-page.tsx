import { useCallback, useEffect } from "react";
import { useSearchParams } from "react-router";
import type { DifficultyOverview, DifficultyRow } from "@pflanzendex/core";
import { EmptyState } from "@/components/shared/empty-state/empty-state";
import { LayerSheet, useLayer } from "@/components/shared/responsive/layer-sheet/layer-sheet";
import { Pager } from "@/components/shared/responsive/pager/pager";
import { useRowPageSize } from "@/components/shared/responsive/pager/row-page-size";
import { Button } from "@/components/ui/button/button";
import { LoadFrame } from "../../../kernel";
import { loadDifficulty } from "../../insights/api/difficulty-api";
import { DifficultyPageSkeleton } from "./difficulty-page.skeleton";
import { PageFrame, Plain, Quiet, TITLE } from "../../specimens/cards/parts/parts";
import { keepTogether } from "@/lib/format";
import { zoneLabel } from "@pflanzendex/core";

const LEVELS: Record<number, string> = { 1: "Leicht", 2: "Mittel", 3: "Schwer" };
const UNKNOWN = "unbekannt";
/** Unknown difficulty stays "unbekannt" (P-08), never "Leicht". */
const level = (d: number | null): string => (d === null ? UNKNOWN : (LEVELS[d] ?? UNKNOWN));
const OWN = " (dein Pflegeprofil)";

/** The zone; my care-profile zone says where it comes from (US-BES-09, #306). */
const zoneText = (r: DifficultyRow) =>
  r.zone ? `${zoneLabel(r.zone.name)}${r.zoneSource === "profile" ? OWN : ""}` : UNKNOWN;

/** My watering intervals from the care profile, else the catalog hint (US-BES-09, #306). */
function wateringText(r: DifficultyRow): string {
  const own = r.ownWatering;
  if (!own) return r.wateringHint ?? UNKNOWN;
  const parts = [
    own.growthDays === null ? null : keepTogether(`alle ${own.growthDays} Tage`),
    own.dormancyDays === null ? null : keepTogether(`in der Ruhe alle ${own.dormancyDays} Tage`),
  ].filter((p): p is string => p !== null);
  return `${parts.join(", ")}${OWN}`;
}

/** The values of one species in the order of the comparison; the layer shows them all, the entry the first ones (DS-24). */
const COLUMNS: { key: string; header: string; cell: (r: DifficultyRow) => string }[] = [
  { key: "botanical", header: "Botanischer Name", cell: (r) => r.botanicalName },
  { key: "zone", header: "Lichtzone", cell: zoneText },
  { key: "watering", header: "Gießregel", cell: wateringText },
  { key: "substrate", header: "Substrat", cell: (r) => r.substrate ?? UNKNOWN },
  { key: "pruning", header: "Schnitt", cell: (r) => r.pruning ?? UNKNOWN },
  { key: "success", header: "Erfolgskriterium", cell: (r) => r.successCriteria },
  { key: "difficulty", header: "Schwierigkeit", cell: (r) => level(r.difficulty) },
];

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
 * Species with an active specimen side by side, easiest first (US-BES-05); a missing value says "unbekannt" (P-08).
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

function Entry({ row }: { row: DifficultyRow }) {
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
        <span className="text-sm font-normal text-muted-foreground">
          {`${level(row.difficulty)} · ${zoneText(row)}`}
        </span>
      </span>
      <span className="text-2xl leading-none text-muted-foreground" aria-hidden="true">
        ›
      </span>
    </Button>
  );
}

function Values({ row }: { row: DifficultyRow }) {
  return (
    <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 break-words text-sm">
      {COLUMNS.map((c) => (
        <div key={c.key} className="contents">
          <dt className="font-semibold">{c.header}</dt>
          <dd className="m-0">{c.cell(row)}</dd>
        </div>
      ))}
    </dl>
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
          <Pager
            items={rows}
            pageSize={size}
            label="Artenvergleich"
            getKey={(r) => r.speciesId}
            listClassName="md:grid md:grid-cols-2"
            renderItem={(r) => <Entry row={r} />}
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

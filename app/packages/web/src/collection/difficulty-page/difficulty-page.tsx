import { useCallback, useEffect } from "react";
import type { DifficultyOverview, DifficultyRow } from "@pflanzendex/core";
import { EmptyState } from "@/components/shared/empty-state/empty-state";
import {
  ResponsiveTable,
  type ResponsiveColumn,
} from "@/components/shared/responsive/responsive-table/responsive-table";
import { LoadFrame } from "../../kernel";
import { loadDifficulty } from "../insights/api/difficulty-api";
import { DifficultyPageSkeleton } from "./difficulty-page.skeleton";
import { PageFrame, Plain, Quiet, TITLE } from "../specimens/cards/parts/parts";

const LEVELS: Record<number, string> = { 1: "Leicht", 2: "Mittel", 3: "Schwer" };
const UNKNOWN = "unbekannt";
const OWN = " (dein Pflegeprofil)";

/** The zone; my care-profile zone says where it comes from (US-BES-09, #306). */
const zoneText = (r: DifficultyRow) =>
  r.zone ? `${r.zone.name}${r.zoneSource === "profile" ? OWN : ""}` : UNKNOWN;

/** My watering intervals from the care profile, else the catalog hint (US-BES-09, #306). */
function wateringText(r: DifficultyRow): string {
  const own = r.ownWatering;
  if (!own) return r.wateringHint ?? UNKNOWN;
  const parts = [
    own.growthDays === null ? null : `alle ${own.growthDays} Tage`,
    own.dormancyDays === null ? null : `in der Ruhe alle ${own.dormancyDays} Tage`,
  ].filter((p): p is string => p !== null);
  return `${parts.join(", ")}${OWN}`;
}

/** One column definition for the card stack (phone) and the table (from `md`), so the two cannot drift (DS-24). */
const COLUMNS: ResponsiveColumn<DifficultyRow>[] = [
  { key: "species", header: "Art", cell: (r) => <strong>{r.speciesName}</strong> },
  { key: "botanical", header: "Botanischer Name", cell: (r) => r.botanicalName },
  { key: "zone", header: "Lichtzone", cell: zoneText },
  { key: "watering", header: "Gießregel", cell: wateringText },
  { key: "substrate", header: "Substrat", cell: (r) => r.substrate ?? UNKNOWN },
  { key: "pruning", header: "Schnitt", cell: (r) => r.pruning ?? UNKNOWN },
  { key: "success", header: "Erfolgskriterium", cell: (r) => r.successCriteria },
  { key: "difficulty", header: "Schwierigkeit", cell: (r) => LEVELS[r.difficulty] ?? UNKNOWN },
];

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
    <Quiet className="mb-3">
      {`${species} deiner Exemplare kannst du nicht mehr lesen; sie fehlen in diesem Vergleich.`}
    </Quiet>
  );
}

function DifficultyTable(props: {
  rows: readonly DifficultyRow[];
  unreadable: number;
  host: boolean;
}) {
  const { rows, host } = props;
  return (
    <section aria-labelledby="difficulty-title">
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
          title="Noch keine Art mit aktivem Exemplar"
          description="Lege im Bestand ein Exemplar an, dann erscheint seine Art hier."
        />
      ) : (
        <>
          <Quiet className="mb-3">
            Deine Arten nach Schwierigkeit, die leichtesten zuerst. So schlägst du Pflegeregeln
            nach, ohne jede Art zu öffnen.
          </Quiet>
          <ResponsiveTable
            caption="Artenvergleich"
            columns={COLUMNS}
            rows={[...rows]}
            getRowKey={(r) => r.speciesId}
          />
        </>
      )}
    </section>
  );
}

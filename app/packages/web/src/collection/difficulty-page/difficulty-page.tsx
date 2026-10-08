import { useCallback, useEffect } from "react";
import type { DifficultyRow } from "@pflanzendex/core";
import { EmptyState } from "@/components/shared/empty-state";
import { ResponsiveTable, type ResponsiveColumn } from "@/components/shared/responsive-table";
import { LoadFrame } from "../../kernel";
import { loadDifficulty } from "../difficulty-api";
import { DifficultyPageSkeleton } from "./difficulty-page.skeleton";
import { PageFrame, Plain, Quiet, TITLE } from "../parts";

const LEVELS: Record<number, string> = { 1: "Leicht", 2: "Mittel", 3: "Schwer" };
const UNKNOWN = "unbekannt";

/** One column definition for the card stack (phone) and the table (from `md`), so the two cannot drift (DS-24). */
const COLUMNS: ResponsiveColumn<DifficultyRow>[] = [
  { key: "species", header: "Art", cell: (r) => <strong>{r.speciesName}</strong> },
  { key: "botanical", header: "Botanischer Name", cell: (r) => r.botanicalName },
  { key: "zone", header: "Lichtzone", cell: (r) => r.zone?.name ?? UNKNOWN },
  { key: "watering", header: "Gießregel", cell: (r) => r.wateringHint ?? UNKNOWN },
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
        {(rows: readonly DifficultyRow[]) => (
          <>
            <ReportCaption host={host} count={rows.length} />
            <DifficultyTable rows={rows} host={host !== undefined} />
          </>
        )}
      </LoadFrame>
    </Frame>
  );
}

function DifficultyTable({ rows, host }: { rows: readonly DifficultyRow[]; host: boolean }) {
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

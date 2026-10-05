import { useCallback } from "react";
import type { DifficultyRow } from "@pflanzendex/core";
import { EmptyState } from "@/components/shared/empty-state";
import { ResponsiveTable, type ResponsiveColumn } from "@/components/shared/responsive-table";
import { LoadFrame } from "../kernel";
import { loadDifficulty } from "./difficulty-api";
import { DifficultyPageSkeleton } from "./DifficultyPage.skeleton";
import { PageFrame, Quiet, TITLE } from "./parts";

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

/** Species with an active specimen side by side, easiest first (US-BES-05); a missing value says "unbekannt" (P-08). */
export function DifficultyPage(props: { api: string; token: () => Promise<string | undefined> }) {
  const { api, token } = props;
  const load = useCallback((t: string) => loadDifficulty(api, t), [api]);
  return (
    <PageFrame>
      <LoadFrame
        queryKey={["collection", "difficulty"]}
        token={token}
        load={load}
        loadingText="Artenvergleich wird geladen …"
        loadingFallback={<DifficultyPageSkeleton label="Artenvergleich wird geladen …" />}
      >
        {(rows: readonly DifficultyRow[]) => <DifficultyTable rows={rows} />}
      </LoadFrame>
    </PageFrame>
  );
}

function DifficultyTable({ rows }: { rows: readonly DifficultyRow[] }) {
  return (
    <section aria-labelledby="difficulty-title">
      <h1 id="difficulty-title" className={TITLE}>
        Artenvergleich
      </h1>
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

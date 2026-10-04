import "./collection.css";
import { useCallback } from "react";
import type { DifficultyRow } from "@pflanzendex/core";
import { LoadFrame } from "../kernel";
import { loadDifficulty } from "./difficulty-api";

const LEVELS: Record<number, string> = { 1: "Leicht", 2: "Mittel", 3: "Schwer" };
const UNKNOWN = "unbekannt";

/** Species with an active specimen side by side, easiest first (US-BES-05); a missing value says "unbekannt" (P-08). */
export function DifficultyPage(props: { api: string; token: () => Promise<string | undefined> }) {
  const { api, token } = props;
  const load = useCallback((t: string) => loadDifficulty(api, t), [api]);
  return (
    <div className="light collection difficulty-page">
      <LoadFrame token={token} load={load} loadingText="Artenvergleich wird geladen …">
        {(rows: readonly DifficultyRow[]) => <DifficultyTable rows={rows} />}
      </LoadFrame>
    </div>
  );
}

function DifficultyTable({ rows }: { rows: readonly DifficultyRow[] }) {
  return (
    <section aria-labelledby="difficulty-title">
      <h1 id="difficulty-title">Artenvergleich</h1>
      {rows.length === 0 ? (
        <p className="next-action">
          Noch keine Art mit aktivem Exemplar: Lege im Bestand ein Exemplar an, dann erscheint seine
          Art hier.
        </p>
      ) : (
        <>
          <p className="quiet">
            Deine Arten nach Schwierigkeit, die leichtesten zuerst. So schlägst du Pflegeregeln
            nach, ohne jede Art zu öffnen.
          </p>
          <p className="quiet table-hint">Die Tabelle lässt sich seitlich scrollen.</p>
          <div className="table-scroll" role="region" aria-label="Artenvergleich" tabIndex={0}>
            <table className="difficulty-table">
              <thead>
                <tr>
                  <th scope="col">Art</th>
                  <th scope="col">Botanischer Name</th>
                  <th scope="col">Lichtzone</th>
                  <th scope="col">Gießregel</th>
                  <th scope="col">Substrat</th>
                  <th scope="col">Schnitt</th>
                  <th scope="col">Erfolgskriterium</th>
                  <th scope="col">Schwierigkeit</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.speciesId}>
                    <th scope="row">{r.speciesName}</th>
                    <td>{r.botanicalName}</td>
                    <td>{r.zone?.name ?? UNKNOWN}</td>
                    <td>{r.wateringHint ?? UNKNOWN}</td>
                    <td>{r.substrate ?? UNKNOWN}</td>
                    <td>{r.pruning ?? UNKNOWN}</td>
                    <td>{r.successCriteria}</td>
                    <td>{LEVELS[r.difficulty] ?? UNKNOWN}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

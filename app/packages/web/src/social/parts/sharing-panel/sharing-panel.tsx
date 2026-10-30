import { useState } from "react";
import type { SharingRow, SpecimenRow } from "@pflanzendex/core";
import { Pager } from "@/components/shared/responsive/pager/pager";
import { Button } from "@/components/ui/button/button";
import { Checkbox } from "@/components/ui/fields/checkbox/checkbox";

type Specimen = Pick<SpecimenRow, "id" | "speciesId" | "name" | "status">;

/** Switches per page in the layer (starting value, assumption; the page size from the free height is #1029; US-QS-20). */
const PAGE_SIZE = 5;

/** What the row "Was Freunde sehen" shows as the current choice: all private, or how many specimens are shared. */
export function sharingChoice(
  specimens: readonly Specimen[],
  shared: readonly SharingRow[],
): string {
  const active = specimens.filter((s) => s.status !== "archived");
  if (active.length === 0) return "Noch keine Pflanzen";
  const ids = new Set(shared.map((r) => r.specimenId));
  const count = active.filter((s) => ids.has(s.id)).length;
  return count === 0 ? "Alles privat" : `${count} von ${active.length} Pflanzen geteilt`;
}

/** The species part of a specimen name (`Species – marker`, DM-BES-03): the marker is never needed here. */
const speciesTitle = (name: string) => name.split(" – ")[0] ?? name;

/** The active specimens grouped by species, in the order of the list. */
function groups(specimens: readonly Specimen[]) {
  const out = new Map<string, { title: string; items: Specimen[] }>();
  for (const s of specimens) {
    if (s.status === "archived") continue;
    const g = out.get(s.speciesId) ?? { title: speciesTitle(s.name), items: [] };
    g.items.push(s);
    out.set(s.speciesId, g);
  }
  return [...out].map(([speciesId, g]) => ({ speciesId, ...g }));
}

/** One switch per specimen, the species name above the first row of its group (and again at the top of a page). */
function Row(props: {
  row: Specimen;
  title: string | null;
  checked: boolean;
  busy: boolean;
  onSet: (specimenId: string, share: boolean) => void;
}) {
  return (
    <div className="flex flex-col">
      {props.title !== null && <h3 className="mt-1 text-sm font-semibold">{props.title}</h3>}
      <Checkbox
        role="switch"
        checked={props.checked}
        disabled={props.busy}
        onChange={(e) => props.onSet(props.row.id, e.target.checked)}
      >
        {props.row.name}: mit Freunden teilen
      </Checkbox>
    </div>
  );
}

/** The one bulk action on top: both directions ask first, and nothing widens without the explicit "Ja" (P-05). */
function BulkBar(props: { count: number; busy: boolean; onSetAll: (share: boolean) => void }) {
  const [ask, setAsk] = useState<boolean | null>(null);
  if (ask !== null)
    return (
      <div
        role="group"
        aria-label="Bestätigen"
        className="flex flex-col gap-2 rounded-lg border border-border p-3"
      >
        <p>
          {ask
            ? `Alle ${props.count} Pflanzen für Freunde freigeben? Freunde sehen dann Art, Anzahl und Fangdatum.`
            : `Die Freigabe aller ${props.count} Pflanzen zurückziehen?`}
        </p>
        <span className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="touch"
            disabled={props.busy}
            onClick={() => {
              props.onSetAll(ask);
              setAsk(null);
            }}
          >
            {ask ? "Ja, alle teilen" : "Ja, alle zurückziehen"}
          </Button>
          <Button type="button" size="touch" variant="outline" onClick={() => setAsk(null)}>
            Abbrechen
          </Button>
        </span>
      </div>
    );
  return (
    <span className="flex flex-wrap gap-2">
      <Button
        type="button"
        size="touch"
        variant="outline"
        disabled={props.busy}
        onClick={() => setAsk(true)}
      >
        Alle teilen
      </Button>
      <Button
        type="button"
        size="touch"
        variant="outline"
        disabled={props.busy}
        onClick={() => setAsk(false)}
      >
        Alle zurückziehen
      </Button>
    </span>
  );
}

/**
 * The content of the layer "Was Freunde sehen" (US-SOZ-04, US-QS-20): a switch per specimen (off by default: everything is
 * private, P-05), grouped by species, one bulk action on top that asks first, and pages. The full explanation of what a
 * friend can see and what never leaves the account (FR-SOZ-01), and that withdrawing works from the next retrieval on
 * (P-10), is the help layer; here one line stays.
 */
export function SharingPanel(props: {
  specimens: readonly Specimen[];
  shared: readonly SharingRow[];
  busy: boolean;
  onSet: (specimenId: string, share: boolean) => void;
  onSetAll: (share: boolean) => void;
}) {
  const shared = new Set(props.shared.map((r) => r.specimenId));
  const rows = groups(props.specimens).flatMap((g) => g.items.map((s) => ({ s, title: g.title })));
  return (
    <section aria-label="Was Freunde sehen" className="flex min-w-0 flex-col gap-3">
      <p className="text-muted-foreground">Alles ist privat, bis du es freigibst.</p>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-3">
          Du hast noch keine Pflanzen, die du freigeben könntest. Lege zuerst unter „Sammlung“ ein
          Pflanze an.
        </p>
      ) : (
        <>
          <BulkBar count={rows.length} busy={props.busy} onSetAll={props.onSetAll} />
          <Pager
            items={rows}
            pageSize={PAGE_SIZE}
            label="Pflanzen zum Teilen"
            getKey={(r) => r.s.id}
            renderItem={(r, i) => (
              <Row
                row={r.s}
                title={
                  i % PAGE_SIZE === 0 || rows[i - 1]?.s.speciesId !== r.s.speciesId ? r.title : null
                }
                checked={shared.has(r.s.id)}
                busy={props.busy}
                onSet={props.onSet}
              />
            )}
          />
        </>
      )}
    </section>
  );
}

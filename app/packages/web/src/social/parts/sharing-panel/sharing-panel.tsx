import { useState } from "react";
import type { SharingRow, SpecimenRow } from "@pflanzendex/core";
import { useIsShort } from "@/shared/patterns/responsive/entry-list/card-page-size";
import { ScrollEntries } from "@/shared/patterns/responsive/entry-list/paging/scroll-entries/scroll-entries";
import { Button } from "@/shared/ui/button";
import { OBJECT_GROUP } from "@/shared/lists/grouped-list/group-classes";
import { Thumbnail } from "@/shared/lists/object-row/object-row";
import { SwitchRow } from "@/shared/lists/switch-row/switch-row";
import { texts } from "@/shared/lib/text-rules/texts";
import { EmptySection } from "@/shared/patterns/elements/empty-state/empty-section/empty-section";
import { ADD_PLANT_PATH } from "@/shared/patterns/navigation/navigation/navigation";
import table from "../../social.de.json";

const tx = texts(table);

type Specimen = Pick<SpecimenRow, "id" | "speciesId" | "name" | "status">;

/** Switches per page in the layer (starting value, assumption; the page size from the free height is #1029; US-QS-20). */
const PAGE_SIZE = 5;
/** On a short phone (at most 700 px high) a page holds fewer switches. */
const SHORT_PAGE_SIZE = 3;

/**
 * What the row "Was Freunde sehen" shows as the current choice: how many specimens are shared, "0 von 2" included.
 * "Alles privat" names only the switch in "Einstellungen" (SG-COPY-03, F-0249).
 */
export function sharingChoice(
  specimens: readonly Specimen[],
  shared: readonly SharingRow[],
): string {
  const active = specimens.filter((s) => s.status !== "archived");
  if (active.length === 0) return "Noch keine Pflanzen";
  const ids = new Set(shared.map((r) => r.specimenId));
  const count = active.filter((s) => ids.has(s.id)).length;
  return `${count} von ${active.length} Pflanzen geteilt`;
}

/** The active specimens grouped by species, in the order of the list (the species stays no heading, SG-LIST-03). */
function ordered(specimens: readonly Specimen[]): Specimen[] {
  const out = new Map<string, Specimen[]>();
  for (const s of specimens) {
    if (s.status === "archived") continue;
    out.set(s.speciesId, [...(out.get(s.speciesId) ?? []), s]);
  }
  return [...out.values()].flat();
}

/**
 * One row per plant (US-QS-32, SG-CTRL-02, SG-LIST-03): the thumbnail, the plant's name with "mit Freunden teilen" and the
 * switch at the trailing edge; no heading of the species above it. The friends' list data has no picture of the plant, so the
 * drawn placeholder shows (SG-PHOTO-02).
 */
function Row(props: {
  row: Specimen;
  checked: boolean;
  busy: boolean;
  onSet: (specimenId: string, share: boolean) => void;
}) {
  return (
    <SwitchRow
      bare
      leading={<Thumbnail src={undefined} alt="" />}
      label={tx("sharing.row", { name: props.row.name })}
      checked={props.checked}
      busy={props.busy}
      onCheckedChange={(share) => props.onSet(props.row.id, share)}
    />
  );
}

/** The one bulk action on top: both directions ask first, and nothing widens without the confirming verb ("Alle teilen", not "Ja", SG-SHEET-05; P-05). */
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
            ? `Alle ${props.count} Pflanzen für Freunde freigeben? Freunde sehen dann nur ${tx("shared.fields")}.`
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
            {ask ? "Alle teilen" : "Alle zurückziehen"}
          </Button>
          <Button type="button" size="touch" variant="plain" onClick={() => setAsk(null)}>
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
        variant="plain"
        disabled={props.busy}
        onClick={() => setAsk(true)}
      >
        Alle teilen
      </Button>
      <Button
        type="button"
        size="touch"
        variant="plain"
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
 * private, P-05), one bulk action on top that asks first, and pages. The full explanation of what a
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
  const size = useIsShort() ? SHORT_PAGE_SIZE : PAGE_SIZE;
  const shared = new Set(props.shared.map((r) => r.specimenId));
  const rows = ordered(props.specimens);
  return (
    <section aria-label="Was Freunde sehen" className="flex min-w-0 flex-col gap-3">
      <p className="text-muted-foreground">Alles ist privat, bis du es freigibst.</p>
      {rows.length === 0 ? (
        <EmptySection
          text={tx("sharing.none")}
          action={{ label: tx("sharing.addPlant"), href: ADD_PLANT_PATH }}
        />
      ) : (
        <>
          <BulkBar count={rows.length} busy={props.busy} onSetAll={props.onSetAll} />
          <ScrollEntries
            items={rows}
            pageSize={size}
            label="Pflanzen zum Teilen"
            getKey={(r) => r.id}
            listClassName={OBJECT_GROUP}
            renderItem={(r) => (
              <Row row={r} checked={shared.has(r.id)} busy={props.busy} onSet={props.onSet} />
            )}
          />
        </>
      )}
    </section>
  );
}

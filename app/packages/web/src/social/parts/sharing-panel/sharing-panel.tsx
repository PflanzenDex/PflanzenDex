import type { SharingRow, SpecimenRow } from "@pflanzendex/core";
import { Button } from "@/components/ui/button/button";
import { Checkbox } from "@/components/ui/fields/checkbox/checkbox";

type Specimen = Pick<SpecimenRow, "id" | "speciesId" | "name" | "status">;

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

function SpeciesGroup(props: {
  group: { speciesId: string; title: string; items: Specimen[] };
  shared: ReadonlySet<string>;
  busy: boolean;
  onSet: (specimenId: string, share: boolean) => void;
  onSetSpecies: (speciesId: string, share: boolean) => void;
}) {
  const { group: g } = props;
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border p-3">
      <h3 className="font-semibold">{g.title}</h3>
      {g.items.map((s) => (
        <Checkbox
          key={s.id}
          checked={props.shared.has(s.id)}
          disabled={props.busy}
          onChange={(e) => props.onSet(s.id, e.target.checked)}
        >
          {s.name}: mit Freunden teilen
        </Checkbox>
      ))}
      <span className="mt-1 flex flex-wrap gap-2">
        <Button
          type="button"
          size="touch"
          variant="outline"
          disabled={props.busy}
          aria-label={`Alle Exemplare von ${g.title} teilen`}
          onClick={() => props.onSetSpecies(g.speciesId, true)}
        >
          Alle Exemplare dieser Art teilen
        </Button>
        <Button
          type="button"
          size="touch"
          variant="outline"
          disabled={props.busy}
          aria-label={`Alle Exemplare von ${g.title} zurückziehen`}
          onClick={() => props.onSetSpecies(g.speciesId, false)}
        >
          Alle zurückziehen
        </Button>
      </span>
    </div>
  );
}

/**
 * "Was Freunde sehen" (US-SOZ-04): per specimen "Mit Freunden teilen" (off by default: everything is private, P-05),
 * and per species the bulk actions. Says what a friend can see and what never leaves the account (FR-SOZ-01), and that
 * withdrawing works from the next retrieval on, because what was already delivered cannot be retrieved (P-10).
 */
export function SharingPanel(props: {
  specimens: readonly Specimen[];
  shared: readonly SharingRow[];
  busy: boolean;
  onSet: (specimenId: string, share: boolean) => void;
  onSetSpecies: (speciesId: string, share: boolean) => void;
}) {
  const shared = new Set(props.shared.map((r) => r.specimenId));
  const list = groups(props.specimens);
  return (
    <section aria-labelledby="friend-sharing-title" className="flex min-w-0 flex-col gap-3">
      <h2 id="friend-sharing-title" className="text-xl font-semibold">
        Was Freunde sehen
      </h2>
      <p className="text-muted-foreground">
        Alles ist privat, bis du es freigibst. Freunde sehen von einem freigegebenen Exemplar nur
        die Art, den Namen, das Fangdatum und ob es ein Steckling ist, nie Standort, Messwerte,
        Behandlungen, Kennzeichen oder Preise. Ein Zurückziehen gilt ab dem nächsten Abruf; was
        schon angezeigt wurde, lässt sich nicht zurückholen. „Alles privat“ in den Einstellungen
        setzt alle Freigaben aus, ohne sie zu löschen.
      </p>
      {list.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-3">
          Du hast noch keine Exemplare, die du freigeben könntest. Lege zuerst unter „Bestand“ ein
          Exemplar an.
        </p>
      ) : (
        list.map((g) => (
          <SpeciesGroup
            key={g.speciesId}
            group={g}
            shared={shared}
            busy={props.busy}
            onSet={props.onSet}
            onSetSpecies={props.onSetSpecies}
          />
        ))
      )}
    </section>
  );
}

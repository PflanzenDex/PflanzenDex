import { Leaf } from "lucide-react";
import { speciesHints, type Species } from "@pflanzendex/core";
import { Badge } from "@/components/ui/display/badge/badge";
import { Button } from "@/components/ui/button/button";
import { Tabs } from "@/components/data-display/panels/tabs/tabs";
import {
  STATUS,
  UNKNOWN,
  growthText,
  lux,
  orUnknown,
  dormancyPhase,
  difficultyText,
  levelText,
} from "../shared/text";

type Fact = [label: string, value: string];

/** The short facts: they sit in a two-column grid (US-QS-21). */
function basics(species: Species): Fact[] {
  return [
    ["Deutscher Name", orUnknown(species.germanName)],
    ["Englischer Name", orUnknown(species.englishName)],
    ["Schwierigkeit", difficultyText(species.difficulty)],
    ["Standard-Stufe", levelText(species.standardLevel)],
    ["Lichtbedarf", lux(species.lightDemandLux)],
    ["Ruhephase", dormancyPhase(species)],
    ["Wachstumsmaß", growthText(species.growthMeasure)],
    ["Standort-Hinweis", orUnknown(species.locationHint)],
  ];
}

function care(species: Species): Fact[] {
  return [
    ["Gießhinweis", orUnknown(species.wateringHint)],
    ["Substrat", orUnknown(species.substrate)],
    ["Rückschnitt", orUnknown(species.pruning)],
    ["Wuchs-Hacks", orUnknown(species.growthHacks)],
    ["Vergeilung-Anzeichen", orUnknown(species.etiolationSigns)],
    ["Erfolgskriterien", orUnknown(species.successCriteria)],
  ];
}

function origin(species: Species): Fact[] {
  const family = [species.familyGerman, species.familyLatin].filter(Boolean).join(" · ");
  return [
    ["Familie", family || UNKNOWN],
    ["Synonyme", species.synonyms.length > 0 ? species.synonyms.join(", ") : UNKNOWN],
    ["Botanische Story", orUnknown(species.botanicalStory)],
    ["Quelle", orUnknown(species.source)],
  ];
}

/**
 * One panel of the profile: the known facts as a grid, the unknown ones named in one line (P-08, P-10): nothing is
 * invented and nothing disappears silently. View-local until the shared folding of unknown values lands (issue 1030).
 */
function FactPanel(props: { facts: Fact[]; columns: boolean }) {
  const known = props.facts.filter(([, value]) => value !== UNKNOWN);
  const unknown = props.facts.filter(([, value]) => value === UNKNOWN);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {known.length > 0 && (
        <dl className={`m-0 grid gap-x-4 gap-y-2 ${props.columns ? "grid-cols-2" : "grid-cols-1"}`}>
          {known.map(([name, value]) => (
            <div
              key={name}
              className="min-w-0 [&>dd]:m-0 [&>dd]:break-words [&>dd]:whitespace-pre-wrap"
            >
              <dt className="text-sm text-muted-foreground">{name}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {unknown.length > 0 && (
        <p className="m-0 text-sm text-muted-foreground">
          Noch unbekannt: {unknown.map(([name]) => name).join(", ")}.
        </p>
      )}
    </div>
  );
}

/** Photo slot of fixed size; species carry no photo yet (DM-BES-01), so it shows a neutral mark, never an invented image. */
function PhotoSlot() {
  return (
    <span
      aria-hidden="true"
      className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground"
    >
      <Leaf className="size-8" />
    </span>
  );
}

/** The facts in three tabs: Steckbrief (grid), Pflege and Herkunft (one column, the texts are long). */
function ProfileTabs({ species }: { species: Species }) {
  return (
    <Tabs
      label="Angaben zur Art"
      tabs={[
        {
          value: "basics",
          label: "Steckbrief",
          content: <FactPanel facts={basics(species)} columns />,
        },
        {
          value: "care",
          label: "Pflege",
          content: <FactPanel facts={care(species)} columns={false} />,
        },
        {
          value: "origin",
          label: "Herkunft",
          content: <FactPanel facts={origin(species)} columns={false} />,
        },
      ]}
    />
  );
}

/**
 * Profile with the fields from DM-BES-01 (US-QS-21): a header with name, photo slot and the primary action, then the
 * facts in three tabs (Steckbrief, Pflege, Herkunft). Missing details are called "unknown" (P-08), hints name the next
 * action (P-09).
 */
export function SpeciesProfile(props: {
  species: Species;
  onChoose?: () => void;
  onBack?: () => void;
  /** Below a destination title the profile is a section: its name is then an h2 (US-QS-14). */
  embedded?: boolean | undefined;
}) {
  const { species } = props;
  const Heading = props.embedded ? "h2" : "h1";
  return (
    <article aria-labelledby="species-title" className="flex min-w-0 flex-col gap-3">
      {props.onBack && (
        <Button type="button" variant="secondary" className="self-start" onClick={props.onBack}>
          Zurück zur Suche
        </Button>
      )}
      <header className="flex min-w-0 items-center gap-3">
        <PhotoSlot />
        <div className="flex min-w-0 flex-col items-start gap-1">
          <Heading id="species-title" className="break-words text-2xl font-semibold">
            <i>{species.latinName}</i>
          </Heading>
          <Badge variant="outline">{STATUS[species.reviewStatus]}</Badge>
        </div>
      </header>
      {props.onChoose && (
        <Button
          type="button"
          size="touch"
          className="w-full sm:w-auto sm:self-start"
          onClick={props.onChoose}
        >
          Diese Art wählen
        </Button>
      )}
      {speciesHints(species).map((h) => (
        <p
          key={h.text}
          className="rounded-lg border border-warning-border bg-warning p-3 text-warning-foreground"
        >
          {h.text} {h.nextAction}
        </p>
      ))}
      <ProfileTabs species={species} />
    </article>
  );
}

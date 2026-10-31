import type { ReactNode } from "react";
import { ArrowLeft, Leaf } from "lucide-react";
import { speciesHints, type Species } from "@pflanzendex/core";
import { Badge } from "@/components/ui/display/badge/badge";
import { Button } from "@/components/ui/button/button";
import {
  FactGrid,
  type Fact,
} from "@/components/shared/responsive/responsive-table/fact-grid/fact-grid";
import { Tabs } from "@/components/data-display/panels/tabs/tabs";
import {
  STATUS,
  UNKNOWN,
  growthText,
  lux,
  dormancyPhase,
  difficultyText,
  levelText,
} from "../shared/text";

const known = (value: string | null | undefined): string | null => value ?? null;
const text = (value: string): string | null => (value === UNKNOWN ? null : value);

/** The short facts of the Steckbrief tab; `null` is unknown and folds into one line (P-08, P-10). */
function basics(species: Species): Fact[] {
  return [
    { label: "Deutscher Name", value: known(species.germanName) },
    { label: "Englischer Name", value: known(species.englishName) },
    { label: "Schwierigkeit", value: text(difficultyText(species.difficulty)) },
    { label: "Standard-Stufe", value: text(levelText(species.standardLevel)) },
    { label: "Lichtbedarf", value: text(lux(species.lightDemandLux)) },
    { label: "Ruhephase", value: text(dormancyPhase(species)) },
    { label: "Wachstumsmaß", value: text(growthText(species.growthMeasure)) },
    { label: "Standort-Hinweis", value: known(species.locationHint) },
  ];
}

function care(species: Species): Fact[] {
  return [
    { label: "Gießhinweis", value: known(species.wateringHint) },
    { label: "Substrat", value: known(species.substrate) },
    { label: "Rückschnitt", value: known(species.pruning) },
    { label: "Wuchs-Hacks", value: known(species.growthHacks) },
    { label: "Vergeilung-Anzeichen", value: known(species.etiolationSigns) },
    { label: "Erfolgskriterien", value: known(species.successCriteria) },
  ];
}

function origin(species: Species): Fact[] {
  const family = [species.familyGerman, species.familyLatin].filter(Boolean).join(" · ");
  return [
    { label: "Familie", value: family || null },
    { label: "Synonyme", value: species.synonyms.length > 0 ? species.synonyms.join(", ") : null },
    { label: "Botanische Story", value: known(species.botanicalStory) },
    { label: "Quelle", value: known(species.source) },
  ];
}

/** Photo slot of fixed size; species carry no photo yet (DM-BES-01), so it shows a neutral mark, never an invented image. */
function PhotoSlot() {
  return (
    <span
      aria-hidden="true"
      className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground"
    >
      <Leaf className="size-6" />
    </span>
  );
}

/** The facts in three tabs: Steckbrief (grid), Pflege and Herkunft (one column, the texts are long). */
function ProfileTabs({ species }: { species: Species }) {
  return (
    <Tabs
      className="flex min-h-0 flex-1 flex-col"
      panelClassName="mt-1 min-h-[40dvh] flex-1 overflow-y-auto"
      wrap
      label="Angaben zur Art"
      tabs={[
        {
          value: "basics",
          label: "Steckbrief",
          content: <FactGrid facts={basics(species)} />,
        },
        {
          value: "care",
          label: "Pflege",
          content: <FactGrid facts={care(species)} />,
        },
        {
          value: "origin",
          label: "Herkunft",
          content: <FactGrid facts={origin(species)} />,
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
  /** A further action beside the primary one, e.g. the opener of "Mein Pflegeprofil" (US-BES-09), wired by the app. */
  extra?: ReactNode;
}) {
  const { species } = props;
  const Heading = props.embedded ? "h2" : "h1";
  return (
    <article aria-labelledby="species-title" className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      <header className="flex min-w-0 items-center gap-3">
        {props.onBack && (
          <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label="Zurück zur Suche"
            title="Zurück zur Suche"
            className="shrink-0"
            onClick={props.onBack}
          >
            <ArrowLeft className="size-5" aria-hidden="true" />
          </Button>
        )}
        <PhotoSlot />
        <div className="flex min-w-0 flex-1 flex-col items-stretch gap-1">
          <Heading
            id="species-title"
            className="break-words text-lg font-semibold leading-tight md:text-xl"
          >
            <i>{species.latinName}</i>
          </Heading>
          <Badge variant="outline" className="self-start">
            {STATUS[species.reviewStatus]}
          </Badge>
        </div>
      </header>
      {(props.onChoose || props.extra) && (
        <div className="flex flex-wrap gap-2 [&>*]:min-w-0 [&>*]:flex-1">
          {props.onChoose && (
            <Button type="button" size="touch" onClick={props.onChoose}>
              Diese Art wählen
            </Button>
          )}
          {props.extra}
        </div>
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

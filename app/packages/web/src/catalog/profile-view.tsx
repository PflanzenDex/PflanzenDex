import { speciesHints, type Species } from "@pflanzendex/core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DIFFICULTY, STATUS, GROWTH, lux, orUnknown, dormancyPhase } from "./text";

function rows(species: Species): [string, string][] {
  const family = [species.familyGerman, species.familyLatin].filter(Boolean).join(" · ");
  return [
    ["Deutscher Name", orUnknown(species.germanName)],
    ["Englischer Name", orUnknown(species.englishName)],
    ["Synonyme", species.synonyms.length > 0 ? species.synonyms.join(", ") : "unbekannt"],
    ["Familie", family || "unbekannt"],
    ["Schwierigkeit", DIFFICULTY[species.difficulty] ?? "unbekannt"],
    ["Standard-Stufe", `Stufe ${species.standardLevel}`],
    ["Lichtbedarf", lux(species.lightDemandLux)],
    ["Ruhephase", dormancyPhase(species)],
    ["Standort-Hinweis", orUnknown(species.locationHint)],
    ["Wachstumsmaß", GROWTH[species.growthMeasure]],
    ["Vergeilung-Anzeichen", species.etiolationSigns],
    ["Gießhinweis", orUnknown(species.wateringHint)],
    ["Substrat", orUnknown(species.substrate)],
    ["Rückschnitt", orUnknown(species.pruning)],
    ["Wuchs-Hacks", orUnknown(species.growthHacks)],
    ["Erfolgskriterien", species.successCriteria],
    ["Botanische Story", orUnknown(species.botanicalStory)],
    ["Quelle", orUnknown(species.source)],
  ];
}

/** Profile with the fields from DM-BES-01; missing details are called "unknown" (P-08), hints name the next action (P-09). */
export function SpeciesProfile(props: {
  species: Species;
  onChoose?: () => void;
  onBack?: () => void;
}) {
  const { species } = props;
  return (
    <article aria-labelledby="species-title" className="flex min-w-0 flex-col gap-3">
      {props.onBack && (
        <Button type="button" variant="secondary" className="self-start" onClick={props.onBack}>
          Zurück zur Suche
        </Button>
      )}
      <h1 id="species-title" className="break-words text-2xl font-semibold">
        <i>{species.latinName}</i>
      </h1>
      <Badge variant="outline" className="self-start">
        {STATUS[species.reviewStatus]}
      </Badge>
      {speciesHints(species).map((h) => (
        <p
          key={h.text}
          className="rounded-lg border border-warning-border bg-warning p-3 text-warning-foreground"
        >
          {h.text} {h.nextAction}
        </p>
      ))}
      <dl className="m-0 grid grid-cols-1 gap-x-6 md:grid-cols-2">
        {rows(species).map(([name, value]) => (
          <div
            key={name}
            className="min-w-0 border-b border-border py-2 [&>dd]:m-0 [&>dd]:break-words [&>dd]:whitespace-pre-wrap"
          >
            <dt className="text-sm text-muted-foreground">{name}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {props.onChoose && (
        <Button type="button" size="touch" className="self-start" onClick={props.onChoose}>
          Diese Art wählen
        </Button>
      )}
    </article>
  );
}

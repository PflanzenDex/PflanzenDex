import { speciesHints, type Species } from "@pflanzendex/core";
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
    <article aria-labelledby="species-title">
      {props.onBack && (
        <button type="button" className="secondary back" onClick={props.onBack}>
          Zurück zur Suche
        </button>
      )}
      <h1 id="species-title">
        <i>{species.latinName}</i>
      </h1>
      <p className="badge">{STATUS[species.reviewStatus]}</p>
      {speciesHints(species).map((h) => (
        <p key={h.text} className="hint">
          {h.text} {h.nextAction}
        </p>
      ))}
      <dl className="data profile">
        {rows(species).map(([name, value]) => (
          <div key={name}>
            <dt>{name}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {props.onChoose && (
        <div className="actions">
          <button type="button" className="primary" onClick={props.onChoose}>
            Diese Art wählen
          </button>
        </div>
      )}
    </article>
  );
}

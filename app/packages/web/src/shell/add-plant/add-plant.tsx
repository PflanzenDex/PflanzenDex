import { useState } from "react";
import { useNavigate } from "react-router";
import { FIRST_PLANT_STEPS, type Species } from "@pflanzendex/core";
import { Button } from "@/components/ui/button/button";
import { PATHS } from "../../components/shared/navigation/nav-model/navigation/navigation";
import { SaveStep } from "../onboarding-wizard/save-step/save-step";
import { SpeciesStep, type SpeciesLookup } from "../onboarding-wizard/species-step/species-step";
import { useFirstPlant } from "../onboarding-wizard/use-first-plant";
import { PlaceField, usePlaces } from "./place-field/place-field";

type Token = () => Promise<string | undefined>;
const ACTIONS = "flex flex-col gap-3 sm:flex-row";

interface Props {
  lookup: SpeciesLookup;
  api: string;
  token: Token;
  /** A species that is not found yet: leaves for the catalog. */
  onCatalog: () => void;
  /** "Mehr Angaben": the long form for the chosen species. */
  onMore: (species: Species) => void;
}

function Done(props: { name: string; onAnother: () => void }) {
  const navigate = useNavigate();
  return (
    <section className="flex flex-col gap-3">
      <h2 tabIndex={-1} className="text-xl font-semibold" ref={(e) => e?.focus()}>
        {props.name} ist angelegt
      </h2>
      <div className={ACTIONS}>
        <Button type="button" onClick={() => void navigate(PATHS.collection)}>
          Zum Bestand
        </Button>
        <Button type="button" variant="secondary" onClick={props.onAnother}>
          Noch eine Pflanze
        </Button>
      </div>
    </section>
  );
}

type Plant = ReturnType<typeof useFirstPlant>;

function Buttons(props: { f: Plant; species: Species | null; onMore: (s: Species) => void }) {
  const { f, species } = props;
  if (f.index === 0 || !species)
    return (
      <div className={ACTIONS}>
        <Button type="button" disabled={f.species === null} onClick={() => f.setIndex(1)}>
          {FIRST_PLANT_STEPS[0]?.actionLabel}
        </Button>
      </div>
    );
  return (
    <div className={ACTIONS}>
      <Button type="button" disabled={f.saving || f.zones === null} onClick={() => void f.save()}>
        {FIRST_PLANT_STEPS[1]?.actionLabel}
      </Button>
      <Button type="button" variant="secondary" onClick={() => f.setIndex(0)}>
        Zurück
      </Button>
      <Button type="button" variant="link" onClick={() => props.onMore(species)}>
        Mehr Angaben
      </Button>
    </div>
  );
}

function Flow(props: Props & { onAnother: () => void }) {
  const { api, token } = props;
  const f = useFirstPlant(api, token);
  const places = usePlaces(api, token, f.setLocationId);
  if (f.created) return <Done name={f.created.name} onAnother={props.onAnother} />;
  const species = f.index === 1 ? f.species : null;
  return (
    <div className="flex flex-col gap-3" ref={f.box}>
      <p
        className="m-0 text-sm font-semibold"
        role="status"
      >{`Schritt ${f.index + 1} von ${FIRST_PLANT_STEPS.length}: ${FIRST_PLANT_STEPS[f.index]?.title ?? ""}`}</p>
      {species ? (
        <SaveStep
          species={species}
          zones={f.zones}
          zoneId={f.zoneId}
          onZone={f.setZoneId}
          error={f.error}
        >
          <PlaceField places={places} value={f.locationId} onChange={f.setLocationId} />
        </SaveStep>
      ) : (
        <SpeciesStep
          title="Welche Pflanze?"
          lookup={props.lookup}
          api={api}
          token={token}
          text={f.text}
          onText={f.setText}
          species={f.species}
          onPick={f.pick}
          onCatalog={props.onCatalog}
        />
      )}
      <Buttons f={f} species={species} onMore={props.onMore} />
    </div>
  );
}

/**
 * A further plant (US-ONB-01): the same two steps as the first plant (species, then save with a changeable light
 * need). The place of the last plant is suggested with its light, never stored unseen (P-10); "Mehr Angaben" opens the
 * long form "Exemplar anlegen" for the chosen species.
 */
export function AddPlant(props: Props) {
  const [round, setRound] = useState(0);
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-2xl font-semibold">Pflanze anlegen</h1>
      <Flow key={round} {...props} onAnother={() => setRound((r) => r + 1)} />
    </div>
  );
}

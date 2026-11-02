import { Suspense, useState } from "react";
import { FIRST_PLANT_STEPS } from "@pflanzendex/core";
import { Button } from "@/components/ui/button/button";
import { KeeperStyleQuestion } from "../../account";
import { SaveStep } from "./save-step/save-step";
import { SpeciesStep, type SpeciesLookup } from "./species-step/species-step";
import { useFirstPlant } from "./use-first-plant";
import { WhereQuestion } from "./where-question/where-question";

const ACTIONS = "flex flex-col gap-3 sm:flex-row";

type Token = () => Promise<string | undefined>;
type Flow = ReturnType<typeof useFirstPlant>;

/** After saving: the plant exists and the app names one next action (P-09). */
function Created(props: {
  name: string;
  specimenId: string;
  api: string;
  token: Token;
  onOpen: () => void;
}) {
  const [asked, setAsked] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  return (
    <section className="flex flex-col gap-3">
      <h2 tabIndex={-1} className="text-xl font-semibold">
        {props.name} ist angelegt
      </h2>
      <p className="m-0">Miss deine Pflanze: so siehst du, wie sie wächst.</p>
      {!asked && (
        <WhereQuestion
          api={props.api}
          token={props.token}
          specimenId={props.specimenId}
          onDone={(n) => {
            setNote(n ?? null);
            setAsked(true);
          }}
        />
      )}
      {note && (
        <p role="status" className="m-0">
          {note}
        </p>
      )}
      {asked && (
        <Suspense fallback={null}>
          <KeeperStyleQuestion api={props.api} token={props.token} />
        </Suspense>
      )}
      <div className={ACTIONS}>
        <Button type="button" onClick={props.onOpen}>
          Miss deine Pflanze
        </Button>
      </div>
    </section>
  );
}

function Buttons(props: { f: Flow; onSkip: () => void }) {
  const { f } = props;
  return (
    <div className={ACTIONS}>
      {f.index === 0 ? (
        <>
          <Button
            type="button"
            disabled={f.species === null}
            aria-describedby="first-plant-next-hint"
            onClick={() => f.setIndex(1)}
          >
            {FIRST_PLANT_STEPS[0]?.actionLabel}
          </Button>
          <p id="first-plant-next-hint" className="m-0 self-center text-sm text-muted-foreground">
            {f.species === null ? "Wähle zuerst eine Art aus den Treffern." : ""}
          </p>
        </>
      ) : (
        <>
          <Button
            type="button"
            disabled={f.saving || f.zones === null}
            onClick={() => void f.save()}
          >
            {FIRST_PLANT_STEPS[1]?.actionLabel}
          </Button>
          <Button type="button" variant="outline" onClick={() => f.setIndex(0)}>
            Zurück
          </Button>
        </>
      )}
      <Button type="button" variant="ghost" onClick={props.onSkip}>
        Überspringen
      </Button>
    </div>
  );
}

function Step(props: {
  f: Flow;
  lookup: SpeciesLookup;
  api: string;
  token: Token;
  onCatalog: () => void;
}) {
  const { f } = props;
  if (f.index === 1 && f.species)
    return (
      <SaveStep
        species={f.species}
        zones={f.zones}
        zoneId={f.zoneId}
        onZone={f.setZoneId}
        error={f.error}
      />
    );
  return (
    <SpeciesStep
      lookup={props.lookup}
      api={props.api}
      token={props.token}
      text={f.text}
      onText={f.setText}
      species={f.species}
      onPick={f.pick}
      onCatalog={props.onCatalog}
    />
  );
}

/**
 * The start of a new account (US-ONB-01): the first plant first, in two steps (species, save). No location and no light
 * zone is asked; the light need comes from the species and can be changed. Going back keeps what was entered. The
 * guide can be skipped at any time.
 */
export function OnboardingWizard(props: {
  lookup: SpeciesLookup;
  api: string;
  token: Token;
  /** Leaves for the species catalog (a species that is not found yet). */
  onChoosePlant: () => void;
  /** Skipped: Heute shows the normal first-plant action (US-ACC-03). */
  onSkip: () => void;
  /** The first plant is saved and the keeper goes on to the collection. */
  onCreated: () => void;
}) {
  const f = useFirstPlant(props.api, props.token);
  const step = FIRST_PLANT_STEPS[f.index];
  return (
    <div className="flex flex-col gap-3" ref={f.box}>
      <h1 className="text-2xl font-semibold">Heute</h1>
      {f.created !== null ? (
        <Created
          name={f.created.name}
          specimenId={f.created.id}
          api={props.api}
          token={props.token}
          onOpen={props.onCreated}
        />
      ) : (
        <>
          <p
            className="m-0 self-start rounded-full border border-current px-2.5 py-0.5 text-sm font-semibold"
            role="status"
          >{`Schritt ${f.index + 1} von ${FIRST_PLANT_STEPS.length}: ${step?.title ?? ""}`}</p>
          <Step
            f={f}
            lookup={props.lookup}
            api={props.api}
            token={props.token}
            onCatalog={props.onChoosePlant}
          />
          <Buttons f={f} onSkip={props.onSkip} />
        </>
      )}
    </div>
  );
}

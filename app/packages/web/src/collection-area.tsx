import { Suspense, useMemo, useState } from "react";
import type { Species, Specimen } from "@pflanzendex/core";
import { CollectionPage } from "./collection";
import { MeasurePage } from "./care";
import { PokedexPage } from "./pokedex";
import { PageSkeleton } from "@/components/shared/states/page-skeleton/page-skeleton";
import { SammlungHeader } from "./components/sammlung-header/sammlung-header";
import { SAMMLUNG_VIEWS, useSammlungView } from "./sammlung-view";

type Token = () => Promise<string | undefined>;

/**
 * The destination "Sammlung" (US-QS-14): a switch between the plants (`collection`, with measuring from `care`) and
 * the species (`pokedex`). The app wires the modules (they do not know each other); the species page is a lazy part
 * that loads only when "Arten" is chosen. The specimen currently being measured is remembered by this area (US-WAC-01).
 * A form of the collection or the measure view replaces the title area, because it has its own heading and a way back.
 */
export function CollectionArea(props: {
  api: string;
  token: Token;
  newSpecies: Species | null;
  onSpeciesChoose: () => void;
  onCompleted: (specimen: Specimen) => void;
  onOpenSpecies?: (id: string) => void;
}) {
  const { view: chosen, choose } = useSammlungView();
  // A species handed over from the catalog is created in the plants, whatever mode was remembered (US-BES-02).
  const view = props.newSpecies ? "plants" : chosen;
  const [measure, setMeasure] = useState<{ id: string; name: string } | null>(null);
  const [caption, setCaption] = useState<string | null>(null);
  const [fullView, setFullView] = useState(false);
  const host = useMemo(() => ({ onCaption: setCaption, onFullView: setFullView }), []);
  const own = view === "plants" && (measure !== null || fullView);
  // The pages are their own lazy parts: the title area stays and the skeleton shows below it (DS-55).
  return (
    <>
      {own ? null : (
        <SammlungHeader view={view} options={SAMMLUNG_VIEWS} onChoose={choose} caption={caption} />
      )}
      <Suspense fallback={<PageSkeleton />}>
        {view === "species" ? (
          <PokedexPage
            api={props.api}
            token={props.token}
            host={host}
            {...(props.onOpenSpecies ? { onOpenSpecies: props.onOpenSpecies } : {})}
          />
        ) : measure ? (
          <MeasurePage
            api={props.api}
            token={props.token}
            specimen={measure}
            onBack={() => setMeasure(null)}
          />
        ) : (
          <CollectionPage
            api={props.api}
            token={props.token}
            newSpecies={props.newSpecies}
            onSpeciesChoose={props.onSpeciesChoose}
            onCompleted={props.onCompleted}
            host={host}
            onMeasure={setMeasure}
          />
        )}
      </Suspense>
    </>
  );
}

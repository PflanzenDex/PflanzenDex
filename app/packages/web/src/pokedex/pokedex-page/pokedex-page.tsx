import type { Ownership, UnidentifiedSpecimen } from "@pflanzendex/core";
import { useCallback, useEffect } from "react";
import { CollectorCards } from "@/components/collector-cards/collector-cards";
import { LayerOpener, LayerSheet } from "@/components/shared/responsive/layer-sheet/layer-sheet";
import { LAYER_PARAM, Pager } from "@/components/shared/responsive/pager/pager";
import { LoadFrame } from "../../kernel";
import { Browse } from "../pokedex-browse/pokedex-browse";
import { loadOwnership } from "../caught/ownership-api";
import { PokedexPageSkeleton } from "./pokedex-page.skeleton";
import { CARD } from "../pokedex-cards/pokedex-cards";
import { CollectorRank, PROGRESS_LAYER, ProgressRow } from "../collector-rank/collector-rank";
import { Milestones } from "../milestones/milestones";
import { NewlyCaught } from "../caught/newly-caught/newly-caught";

const CARDS_LAYER = "cards";
const UNCOUNTED_LAYER = "uncounted";

/** Set when a destination shows this page below its own title (US-QS-14). */
type Host = { onCaption: (text: string | null) => void };

/** Tells the host the count line of the loaded page and takes it back when the page goes away (US-QS-14). */
function ReportCaption({ host, caught }: { host: Host | undefined; caught: number }) {
  useEffect(() => {
    host?.onCaption(`${caught} gefangen`);
    return () => host?.onCaption(null);
  }, [host, caught]);
  return null;
}

/**
 * The species the account has caught (US-POK-06) on one screen (US-QS-22): derived from the active specimens, never
 * stored (P-01). The screen holds the progress row, the search with "Filter" and a page of compact entries; the
 * progress, the filters, the details of a species, the collector cards and the specimens that do not count yet are
 * layers. Species caught since the last visit are announced above the progress until the keeper confirms (US-POK-12).
 */
export function PokedexPage(props: {
  api: string;
  token: () => Promise<string | undefined>;
  /** Link from the details to the species profile; the app wires it to the catalog (US-POK-09). */
  onOpenSpecies?: (id: string) => void;
  /** The destination "Sammlung" shows the page below its title: the heading is then a section name (US-QS-14). */
  host?: Host;
}) {
  const { api, token, onOpenSpecies, host } = props;
  const load = useCallback((t: string) => loadOwnership(api, t), [api]);
  return (
    <div className="min-w-0">
      <LoadFrame
        queryKey={["pokedex", "ownership"]}
        token={token}
        load={load}
        loadingText="Pokédex wird geladen …"
        {...(host ? {} : { heading: "Pokédex" })}
        loadingFallback={<PokedexPageSkeleton label="Pokédex wird geladen …" />}
      >
        {(ownership: Ownership) => (
          <section aria-labelledby="pokedex-title" className="flex min-w-0 flex-col gap-2">
            <ReportCaption host={host} caught={ownership.caught.length} />
            {host ? (
              <h2 id="pokedex-title" className="sr-only">
                Arten
              </h2>
            ) : (
              <h1 id="pokedex-title" className="text-2xl font-semibold">
                Pokédex
              </h1>
            )}
            <NewlyCaught api={api} token={token} caught={ownership.caught} />
            <ProgressRow
              caught={ownership.caught.length}
              uncounted={ownership.unidentified.length}
            />
            <Browse caught={ownership.caught} {...(onOpenSpecies ? { onOpenSpecies } : {})} />
            <Layers api={api} token={token} ownership={ownership} />
          </section>
        )}
      </LoadFrame>
    </div>
  );
}

/** The layers of the progress, the collector cards and the specimens that do not count yet (US-QS-22). */
function Layers(props: {
  api: string;
  token: () => Promise<string | undefined>;
  ownership: Ownership;
}) {
  const { ownership } = props;
  return (
    <>
      <LayerSheet id={PROGRESS_LAYER} title="Fortschritt">
        <div className="flex flex-col gap-3">
          <CollectorRank caught={ownership.caught.length} />
          <Milestones caught={ownership.caught} />
          <LayerOpener id={CARDS_LAYER}>Sammlerkarten ansehen</LayerOpener>
          {ownership.unidentified.length > 0 ? (
            <LayerOpener id={UNCOUNTED_LAYER}>
              {`Noch nicht gezählt (${ownership.unidentified.length})`}
            </LayerOpener>
          ) : null}
        </div>
      </LayerSheet>
      <LayerSheet id={CARDS_LAYER} title="Sammlerkarten">
        <CollectorCards api={props.api} token={props.token} />
      </LayerSheet>
      <LayerSheet id={UNCOUNTED_LAYER} title="Noch nicht gezählt">
        <Unidentified specimens={ownership.unidentified} />
      </LayerSheet>
    </>
  );
}

function Unidentified(props: { specimens: readonly UnidentifiedSpecimen[] }) {
  if (props.specimens.length === 0) return null;
  return (
    <Pager
      items={props.specimens}
      pageSize={4}
      label="Noch nicht gezählt"
      param={LAYER_PARAM}
      getKey={(s) => s.specimenId}
      renderItem={(s) => (
        <div className={CARD}>
          <span>{s.text}</span>
          <span className="font-semibold">{s.nextAction}</span>
        </div>
      )}
    />
  );
}

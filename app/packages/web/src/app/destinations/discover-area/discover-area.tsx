import { Suspense, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import type { Species } from "@pflanzendex/core";
import { DiscoverPage } from "@/discover";
import { SpeciesPage } from "@/catalog";
import { useCaughtSpeciesIds } from "@/pokedex";
import { LayerHost } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { SammlungHeader } from "@/app/destinations/collection-area/sammlung-header/sammlung-header";
import { DISCOVER_VIEWS, useDiscoverView, useSuggestionsOn } from "./discover-view";
import { DiscoverModeSkeleton } from "./discover-body/discover-body";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "./discover-area.de.json";

const t = texts(table);

/** The light zone of "Discover for <zone>" from the address (`?zone=3`, US-ENT-07); anything but 2 to 4 means no filter. */
function zoneOf(value: string | null): number | undefined {
  const n = Number(value);
  return value !== null && Number.isInteger(n) && n >= 2 && n <= 4 ? n : undefined;
}

type Token = () => Promise<string | undefined>;

/**
 * The mode "Katalog" (US-QS-21): the species page with the chips "Leicht" and "Noch nicht gefangen" (US-QS-15, owner decision
 * d-166, issue 2587). The app wires them: it reads the caught species from `pokedex` and hands the ids to `catalog`, which does
 * not know `pokedex`. They load only while this mode shows, and the chip waits for them (`null`, disabled) instead of guessing.
 */
function CatalogMode(props: {
  api: string;
  token: Token;
  onChoose: (species: Species) => void;
  profileSection: (species: Species) => ReactNode;
  searchStart?: string | undefined;
}) {
  const caught = useCaughtSpeciesIds(props.api, props.token);
  return (
    <SpeciesPage
      api={props.api}
      token={props.token}
      onChoose={props.onChoose}
      openId={null}
      profileSection={props.profileSection}
      embedded
      quickFilters={{ caught }}
      {...(props.searchStart ? { initialSearch: props.searchStart } : {})}
    />
  );
}

/**
 * The destination "Entdecken" (US-QS-14): a switch between the suggestions as cards (`discover`) and the species
 * catalog with its search and proposal (`catalog`). The app wires the modules (they do not know each other); every
 * mode is a lazy part that loads only when it is chosen, so the swipe cards and the catalog stay out of the shell.
 * The title area carries the one main heading, so the modes show their names as section headings.
 */
export function DiscoverArea(props: {
  api: string;
  token: Token;
  /** The species chosen in the catalog goes to the creation of a specimen (US-BES-02); the app wires it. */
  onChoose: (species: Species) => void;
  /** The care profile section below a species profile (US-BES-09); the app wires it. */
  profileSection: (species: Species) => ReactNode;
  /** The catalog search starts with this text while a bought wish is on its way to the specimen (US-WUN-05). */
  searchStart?: string;
}) {
  const { view, choose } = useDiscoverView();
  const zone = zoneOf(useSearchParams()[0].get("zone"));
  // Without the suggestions (function "discover" or wishlist switched off, US-ONB-09) only the catalog is offered.
  const options = useSuggestionsOn()
    ? DISCOVER_VIEWS
    : DISCOVER_VIEWS.filter((o) => o.value === "catalog");
  return (
    <LayerHost className="min-h-0" data-fit-screen="" data-fit-fill="">
      <SammlungHeader
        title={t("page.title")}
        switchLabel={t("switch.label")}
        view={view}
        options={options}
        onChoose={choose}
        caption={null}
      />
      <Suspense fallback={<DiscoverModeSkeleton view={view} />}>
        {view === "catalog" ? (
          <CatalogMode
            api={props.api}
            token={props.token}
            onChoose={props.onChoose}
            profileSection={props.profileSection}
            searchStart={props.searchStart}
          />
        ) : (
          <DiscoverPage
            api={props.api}
            token={props.token}
            embedded
            {...(zone === undefined ? {} : { zone })}
          />
        )}
      </Suspense>
    </LayerHost>
  );
}

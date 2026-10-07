import { Suspense, type ReactNode } from "react";
import type { Species } from "@pflanzendex/core";
import { DiscoverPage } from "@/discover";
import { SpeciesPage } from "@/catalog";
import { PageSkeleton } from "@/components/shared/states/page-skeleton/page-skeleton";
import { SammlungHeader } from "@/components/sammlung-header/sammlung-header";
import { DISCOVER_VIEWS, useDiscoverView } from "./discover-view";

type Token = () => Promise<string | undefined>;

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
  return (
    <>
      <SammlungHeader
        title="Entdecken"
        switchLabel="Ansicht von Entdecken"
        view={view}
        options={DISCOVER_VIEWS}
        onChoose={choose}
        caption={null}
      />
      <Suspense fallback={<PageSkeleton />}>
        {view === "catalog" ? (
          <SpeciesPage
            api={props.api}
            token={props.token}
            onChoose={props.onChoose}
            openId={null}
            profileSection={props.profileSection}
            embedded
            {...(props.searchStart ? { initialSearch: props.searchStart } : {})}
          />
        ) : (
          <DiscoverPage api={props.api} token={props.token} embedded />
        )}
      </Suspense>
    </>
  );
}

import { useState, type ReactNode } from "react";
import type { Species } from "@pflanzendex/core";
import { EmptyState } from "@/components/shared/empty-state/empty-state";
import { OFFLINE_NOTE } from "@/components/shared/states/request-state/request-state";
import type { ApiError, Request } from "../../kernel";
import { useOpenId, useProfile, useSearch, useSend } from "../species-hooks";
import { SpeciesProfile } from "../profile-view/profile-view";
import { SpeciesSearch } from "../search-view/search-view";
import { ProposalForm } from "../proposal/proposal-form/proposal-form";
import { ProfileSkeleton } from "../profile-view/profile-view.skeleton";
import { refusalText } from "../shared/refusal";

type View = { kind: "search" } | { kind: "proposal" } | { kind: "profile" };

function ProfilePage(props: {
  profile: Request<Species>;
  fresh: boolean;
  embedded: boolean | undefined;
  onChoose: (a: Species) => void;
  onBack: () => void;
  section: ((species: Species) => ReactNode) | undefined;
}) {
  const { profile } = props;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {props.fresh && (
        <p
          role="status"
          className="rounded-lg border border-warning-border bg-warning p-3 text-warning-foreground"
        >
          Dein Vorschlag ist gespeichert und liegt in der Prüfliste.
        </p>
      )}
      {profile.status === "pending" && <ProfileSkeleton />}
      {profile.status === "error" && profile.error && (
        <EmptyState
          variant="error"
          title="Die Art konnte nicht geladen werden."
          description={refusalText(profile.error)}
          action={{ label: "Zurück zur Suche", onClick: props.onBack }}
        />
      )}
      {profile.status === "ready" && profile.value && (
        <>
          {profile.offline && (
            <p role="status" className="text-sm text-muted-foreground">
              {OFFLINE_NOTE}
            </p>
          )}
          <SpeciesProfile
            species={profile.value}
            onChoose={() => props.onChoose(profile.value as Species)}
            onBack={props.onBack}
            embedded={props.embedded}
          />
          {props.section?.(profile.value)}
        </>
      )}
    </div>
  );
}

function SearchFailure(props: { error: ApiError; onRetry: () => void }) {
  return (
    <EmptyState
      variant="error"
      title="Die Suche hat nicht geklappt."
      description={refusalText(props.error)}
      action={{ label: "Erneut versuchen", onClick: props.onRetry }}
    />
  );
}

type SpeciesPageProps = {
  api: string;
  token: () => Promise<string | undefined>;
  onChoose: (species: Species) => void;
  /** Start on the profile of this species (a link from another area, e.g. the Pokédex, US-POK-09). */
  openId?: string | null;
  /** Start the search with this text (a bought wish whose species is not in the catalog yet, US-WUN-05). */
  initialSearch?: string;
  /**
   * A section below the profile of a species that another module provides, e.g. my care profile (US-BES-09, US-QS-14);
   * the app wires it (`catalog` does not know `collection`).
   */
  profileSection?: (species: Species) => ReactNode;
  /** Shown below the title of a destination (Entdecken, mode Katalog): the headings are h2 (US-QS-14). */
  embedded?: boolean;
};

/**
 * Search, view, choose or propose a species in the catalog (US-BES-01). "Choose" reports the species outward; the
 * specimen for it is created by `collection` (US-BES-02), the app wires both (`catalog` does not know `collection`).
 */
export function SpeciesPage(props: SpeciesPageProps) {
  const { api, token, onChoose, openId } = props;
  const [view, setView] = useState<View>(openId ? { kind: "profile" } : { kind: "search" });
  const [searchText, setSearchText] = useState(props.initialSearch ?? "");
  const [fresh, setNew] = useState(false);
  const [profileId, setProfileId] = useOpenId(openId);
  const search = useSearch(api, token, searchText);
  const profile = useProfile(api, token, profileId);
  const open = (id: string) => {
    setView({ kind: "profile" });
    setProfileId(id);
  };
  const send = useSend(api, token, (id) => {
    setNew(true);
    open(id);
  });
  const back = () => {
    setNew(false);
    setView({ kind: "search" });
  };
  const searchError = view.kind === "search" ? search.error : null;
  return (
    <div className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-card px-4 py-6 text-card-foreground md:p-7">
      {searchError && <SearchFailure error={searchError} onRetry={search.retry} />}
      {view.kind === "search" && (
        <SpeciesSearch
          searchText={searchText}
          hit={search.hit}
          loading={search.loading}
          failed={searchError !== null}
          onSearch={setSearchText}
          onOpen={open}
          onPropose={() => setView({ kind: "proposal" })}
          embedded={props.embedded}
        />
      )}
      {view.kind === "proposal" && (
        <ProposalForm
          start={searchText}
          onSend={send}
          onCancel={back}
          onExisting={open}
          embedded={props.embedded}
        />
      )}
      {view.kind === "profile" && (
        <ProfilePage
          profile={profile}
          fresh={fresh}
          embedded={props.embedded}
          onChoose={onChoose}
          onBack={back}
          section={props.profileSection}
        />
      )}
    </div>
  );
}

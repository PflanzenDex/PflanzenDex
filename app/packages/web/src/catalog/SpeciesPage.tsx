import { useEffect, useState } from "react";
import type { Species } from "@pflanzendex/core";
import { EmptyState } from "@/components/shared/empty-state";
import type { ApiError } from "../kernel";
import { propose } from "./species-api";
import { SIGN_IN, useProfile, useSearch, type Profile } from "./species-hooks";
import { SpeciesProfile } from "./profile-view";
import { SpeciesSearch } from "./search-view";
import { ProposalForm } from "./proposal-form";
import { ProfileSkeleton } from "./profile-view.skeleton";
import { refusalText } from "./refusal";

type View = { kind: "search" } | { kind: "proposal" } | { kind: "profile" };

function ProfilePage(props: {
  profile: Profile;
  fresh: boolean;
  onChoose: (a: Species) => void;
  onBack: () => void;
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
      {profile.kind === "loading" && <ProfileSkeleton />}
      {profile.kind === "error" && (
        <EmptyState
          variant="error"
          title="Die Art konnte nicht geladen werden."
          description={refusalText(profile.error)}
          action={{ label: "Zurück zur Suche", onClick: props.onBack }}
        />
      )}
      {profile.kind === "da" && (
        <SpeciesProfile
          species={profile.value}
          onChoose={() => props.onChoose(profile.value)}
          onBack={props.onBack}
        />
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

/**
 * Search, view, choose or propose a species in the catalog (US-BES-01). "Choose" reports the species outward; the
 * specimen for it is created by `collection` (US-BES-02), the app wires both (`catalog` does not know `collection`).
 */
export function SpeciesPage(props: {
  api: string;
  token: () => Promise<string | undefined>;
  onChoose: (species: Species) => void;
  /** Start on the profile of this species (a link from another area, e.g. the Pokédex, US-POK-09). */
  openId?: string | null;
}) {
  const { api, token, onChoose, openId } = props;
  const [view, setView] = useState<View>(openId ? { kind: "profile" } : { kind: "search" });
  const [searchText, setSearchText] = useState("");
  const [fresh, setNew] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const search = useSearch(api, token, searchText, `${view.kind}:${attempt}`);
  const { profile, load } = useProfile(api, token);

  useEffect(() => {
    if (openId) void load(openId);
  }, [openId, load]);
  const open = (id: string) => {
    setView({ kind: "profile" });
    void load(id);
  };
  async function send(input: Record<string, unknown>): Promise<ApiError | null> {
    const t = await token();
    const r = t ? await propose(api, t, input) : { ok: false as const, error: SIGN_IN };
    if (!r.ok) return r.error;
    setNew(true);
    open(r.value.id);
    return null;
  }
  const back = () => {
    setNew(false);
    setView({ kind: "search" });
  };
  const searchError = view.kind === "search" ? search.error : null;
  return (
    <div className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-card px-4 py-6 text-card-foreground md:p-7">
      {searchError && (
        <SearchFailure error={searchError} onRetry={() => setAttempt((n) => n + 1)} />
      )}
      {view.kind === "search" && (
        <SpeciesSearch
          searchText={searchText}
          hit={search.hit}
          loading={search.loading}
          failed={searchError !== null}
          onSearch={setSearchText}
          onOpen={open}
          onPropose={() => setView({ kind: "proposal" })}
        />
      )}
      {view.kind === "proposal" && (
        <ProposalForm start={searchText} onSend={send} onCancel={back} onExisting={open} />
      )}
      {view.kind === "profile" && (
        <ProfilePage profile={profile} fresh={fresh} onChoose={onChoose} onBack={back} />
      )}
    </div>
  );
}

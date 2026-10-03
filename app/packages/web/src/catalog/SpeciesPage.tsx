import "./species.css";
import { useState } from "react";
import type { Species } from "@pflanzendex/core";
import type { ApiError } from "../kernel";
import { propose } from "./species-api";
import { SIGN_IN, useProfile, useSearch, type Profile } from "./species-hooks";
import { SpeciesProfile } from "./profile-view";
import { SpeciesSearch } from "./search-view";
import { ProposalForm } from "./proposal-form";

type View = { kind: "search" } | { kind: "proposal" } | { kind: "profile" };

function ProfilePage(props: {
  profile: Profile;
  fresh: boolean;
  onChoose: (a: Species) => void;
  onBack: () => void;
}) {
  const { profile } = props;
  return (
    <>
      {props.fresh && (
        <p role="status" className="hint">
          Dein Vorschlag ist gespeichert und liegt in der Prüfliste.
        </p>
      )}
      {profile.kind === "loading" && <p role="status">Art wird geladen …</p>}
      {profile.kind === "error" && (
        <p role="alert" className="warning">
          {profile.error.text}
        </p>
      )}
      {profile.kind === "da" ? (
        <SpeciesProfile
          species={profile.value}
          onChoose={() => props.onChoose(profile.value)}
          onBack={props.onBack}
        />
      ) : (
        <button type="button" className="secondary" onClick={props.onBack}>
          Zurück zur Suche
        </button>
      )}
    </>
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
}) {
  const { api, token, onChoose } = props;
  const [view, setView] = useState<View>({ kind: "search" });
  const [searchText, setSearchText] = useState("");
  const [fresh, setNew] = useState(false);
  const search = useSearch(api, token, searchText, view.kind);
  const { profile, load } = useProfile(api, token);

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
  return (
    <div className="light species">
      {search.error && view.kind === "search" && (
        <p role="alert" className="warning">
          {search.error.text}
        </p>
      )}
      {view.kind === "search" && (
        <SpeciesSearch
          searchText={searchText}
          hit={search.hit}
          loading={search.loading}
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

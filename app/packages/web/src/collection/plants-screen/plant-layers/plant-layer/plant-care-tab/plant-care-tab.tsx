import { lazy, Suspense, type ReactNode } from "react";
import { useLocation, useSearchParams } from "react-router";
import type { SpecimenCard } from "@pflanzendex/core";
import { texts } from "@/shared/lib/text-rules/texts";
import { SegmentedControl } from "@/shared/patterns/elements/segmented-control/segmented-control";
import { LayerOpener, LayerSheet } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import type { PhotoAccess } from "@/shared/platform/browser/use-stored-photo";
import { Quiet } from "../../../../specimens/cards/parts/parts";
import table from "./plant-care-tab.de.json";

const t = texts(table);

const CareProfile = lazy(() =>
  import("../../../../care-profile-page/care-profile-page").then((m) => ({
    default: m.CareProfileSection,
  })),
);

const PART_PARAM = "teil";
const PARTS = [
  { value: "behandlungen", label: t("parts.treatments") },
  { value: "profil", label: t("parts.profile") },
] as const;
type Part = (typeof PARTS)[number]["value"];

/** The layer of the own care profile of one plant's species (US-QS-23, US-BES-09). */
export const careProfileLayerId = (specimenId: string): string => `profil-${specimenId}`;

/**
 * The part of "Pflege" in the address (`&teil=behandlungen|profil`, absent means treatments). A change replaces the
 * entry and keeps the state of the layer, so Back from the profile layer returns to the same part.
 */
function usePart(): [Part, (value: Part) => void] {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const part: Part = params.get(PART_PARAM) === "profil" ? "profil" : "behandlungen";
  const choose = (value: Part) => {
    const next = new URLSearchParams(params);
    next.set(PART_PARAM, value);
    setParams(next, { replace: true, state: location.state });
  };
  return [part, choose];
}

/**
 * The own care profile of the plant's species (US-BES-09): a short line and the button that opens its own layer, where
 * the editor loads (a layer loads its data only while it is open, US-QS-22).
 */
function ProfilePart({ card }: { card: SpecimenCard }) {
  return (
    <section aria-labelledby="own-profile" className="grid gap-2">
      <h3 id="own-profile" className="font-semibold">
        {t("profile.title")}
      </h3>
      <Quiet>{t("profile.hint")}</Quiet>
      <LayerOpener id={careProfileLayerId(card.id)}>{t("profile.open")}</LayerOpener>
    </section>
  );
}

/**
 * The layer "Pflegeprofil" of one plant (US-BES-09, US-QS-23): the own care profile of its species with the existing
 * editor. Closing it goes back to the plant layer when the app opened it, so the plant stays where it was.
 */
export function CareProfileLayer(props: { card: SpecimenCard; access: PhotoAccess }) {
  return (
    <LayerSheet id={careProfileLayerId(props.card.id)} title={t("profile.layerTitle")}>
      <Suspense
        fallback={
          <p role="status" className="text-sm text-muted-foreground">
            {t("profile.loading")}
          </p>
        }
      >
        <CareProfile
          api={props.access.api}
          token={props.access.token}
          speciesId={props.card.speciesId}
        />
      </Suspense>
    </LayerSheet>
  );
}

/**
 * "Pflege" of the plant layer (US-QS-23): a segment "Behandlungen | Pflegeprofil". The treatments and the care phase
 * (`care`, a slot) and the repot plan (`repot`, US-BES-19) are one part, the own care profile is the other and opens its
 * own layer, so the tab fits a phone.
 */
export function PlantCareTab(props: { card: SpecimenCard; care: ReactNode; repot?: ReactNode }) {
  const [part, choose] = usePart();
  return (
    <div className="grid gap-4">
      <SegmentedControl label={t("parts.label")} options={PARTS} value={part} onChange={choose} />
      {part === "profil" ? (
        <ProfilePart card={props.card} />
      ) : (
        <>
          {props.care}
          {props.repot}
        </>
      )}
    </div>
  );
}

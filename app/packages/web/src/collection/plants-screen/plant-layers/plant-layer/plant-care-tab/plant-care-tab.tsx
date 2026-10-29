import { lazy, Suspense, type ReactNode } from "react";
import type { SpecimenCard } from "@pflanzendex/core";
import type { PhotoAccess } from "@/lib/use-stored-photo";
import { Quiet } from "../../../../specimens/cards/parts/parts";

const CareProfile = lazy(() =>
  import("../../../../care-profile-page/care-profile-page").then((m) => ({
    default: m.CareProfileSection,
  })),
);

/**
 * "Pflege" (US-QS-23): the treatments and the care phase of the plant (a slot of `care`, with their existing actions,
 * US-BEH-01 to US-BEH-03, US-PHA-03) and the own care profile of its species (US-BES-09), loaded when the tab opens.
 */
export function PlantCareTab(props: { card: SpecimenCard; access: PhotoAccess; care: ReactNode }) {
  return (
    <div className="grid gap-4">
      {props.care}
      <section aria-labelledby="own-profile" className="grid gap-2">
        <h3 id="own-profile" className="font-semibold">
          Eigenes Pflegeprofil
        </h3>
        <Suspense
          fallback={
            <p role="status" className="text-sm text-muted-foreground">
              Pflegeprofil wird geladen …
            </p>
          }
        >
          <CareProfile
            api={props.access.api}
            token={props.access.token}
            speciesId={props.card.speciesId}
          />
        </Suspense>
        <Quiet>Das Profil gilt für alle deine Exemplare dieser Art.</Quiet>
      </section>
    </div>
  );
}

import { FullView } from "@/shared/patterns/navigation/full-view/full-view";
import { PATHS } from "@/shared/patterns/navigation/navigation/navigation";
import { PageHeader } from "@/shared/patterns/navigation/page-header/page-header";
import { LayerHost } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { texts } from "@/shared/lib/text-rules/texts";
import { DelayedSkeleton } from "@/shared/ui/skeleton.delayed";
import { Skeleton } from "@/shared/ui/skeleton";
import { FriendCollectionSkeleton, FriendsPageBody } from "@/social";
import { PROFILE_CARD, ProfileSkeleton } from "@/catalog";
import table from "./route-skeletons.de.json";

const t = texts(table);

/**
 * The route's fallback of "Freunde" until its chunk is there (issue 1727): the heading stands at once as the one h1 (its
 * focus waits for the page's own heading), and the page's skeleton waits for the delay (DS-57). The frame and the section
 * are those of the page, so the heading and the blocks sit where they do on the page. The body is `FriendsPageBody`, the
 * one the start frame draws too (issue 2243). The route skeletons live here, not in the modules: they compose the page
 * header, and the modules' barrels must not load it into the start chunk (issue 2243).
 */
export function FriendsRouteSkeleton() {
  return (
    <LayerHost className="min-h-0" data-fit-screen="" data-fit-fill="">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
        {/* The title is the page's header: in the top bar below md, where the page puts it (issue 2230). */}
        <PageHeader fallback title={t("friends.title")} />
        <FriendsPageBody />
      </section>
    </LayerHost>
  );
}

/**
 * The route's fallback of "Freundes Sammlung" until its chunk is there (issue 1727): the page's header (the title as the one
 * h1 in the top bar below md, named like the page before the friend's name is known (P-08), with its way back and the devices
 * action, US-QS-32); the action keeps its box from the first frame, and the blocks wait for the delay (DS-57).
 */
export function FriendCollectionRouteSkeleton() {
  return (
    <LayerHost data-fit-screen="">
      <FullView
        fallback
        title={t("friendCollection.title")}
        back={{ label: t("friendCollection.back"), to: PATHS.friends }}
        action={
          <div className="h-11 w-24 shrink-0">
            <DelayedSkeleton>
              <Skeleton className="h-full w-full rounded-control" />
            </DelayedSkeleton>
          </div>
        }
      >
        <DelayedSkeleton>
          <FriendCollectionSkeleton label={t("friendCollection.loading")} />
        </DelayedSkeleton>
      </FullView>
    </LayerHost>
  );
}

/**
 * The route's fallback of the species profile (`/discover/species/:id`) until its chunk is there (issue 1727): the frame
 * and the card the profile is shown in, with the profile's own skeleton inside, so the card does not change size when the
 * page arrives. The card waits for the delay like every skeleton (DS-57), so a fast load draws no empty card. The profile
 * has no heading before its name is known, so the fallback has none either (moved here from the module, issue 2243).
 */
export function ProfileRouteSkeleton() {
  return (
    <LayerHost className="min-h-0" data-fit-screen="" data-fit-fill="">
      <DelayedSkeleton>
        <div className={PROFILE_CARD}>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
            <ProfileSkeleton />
          </div>
        </div>
      </DelayedSkeleton>
    </LayerHost>
  );
}

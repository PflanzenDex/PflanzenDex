import { useCallback } from "react";
import { LayerHost, LayerSheet } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { FullView } from "@/shared/patterns/navigation/full-view/full-view";
import { PATHS } from "@/shared/patterns/navigation/navigation/navigation";
import { useRequest } from "../../../shared/data";
import { LoadFrame } from "@/shared/patterns/states/request-state/load-frame/load-frame";
import { loadFriendCollection } from "../../api/friends-api";
import { nameOf } from "../../parts/request-list/request-list";
import { FriendEndLayer, FriendEndMenu, useEndFriendship } from "./parts/friend-end/friend-end";
import {
  EQUIPMENT_LAYER,
  FriendEquipment,
  FriendEquipmentOpener,
} from "./friend-equipment/friend-equipment";
import { FriendCards } from "./parts/cards/friend-cards/friend-cards";
import { FriendCollectionSkeleton } from "./friend-collection.skeleton";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "../../social.de.json";

const tx = texts(table);

/** "Claras Sammlung", "Lars' Sammlung": the German genitive of a name; an unknown name stays unknown (P-08). */
export const collectionTitle = (name: string | null): string => {
  const trimmed = name?.trim() ?? "";
  if (trimmed === "") return tx("friendCollection.title");
  return tx("friendCollection.named", {
    name: /[sßxz]$/i.test(trimmed) ? `${trimmed}'` : `${trimmed}s`,
  });
};

/**
 * The shared collection of one friend (US-SOZ-07): the cards of the species the friend shares, the devices in their layer
 * (US-EQU-12) and, under "Mehr" in the top bar, the end of the friendship after a question (US-QS-32). Only what the friend
 * shares (P-05); no rank (FR-SOZ-11); unknown stays unknown (P-08). The friends page says what happened after the end.
 */
export function FriendCollectionPage(props: {
  api: string;
  token: () => Promise<string | undefined>;
  friendId: string;
}) {
  const { api, friendId } = props;
  const load = useCallback((t: string) => loadFriendCollection(api, t, friendId), [api, friendId]);
  const queryKey = ["social", "friend-collection", friendId];
  // The same request as the frame below shares one cached copy: the heading names the friend once it is there (US-QS-20).
  const loaded = useRequest({ queryKey, token: props.token, load });
  const name = nameOf(loaded.value?.friend.name ?? null);
  const { ending, onYes } = useEndFriendship({ api, token: props.token, friendId, name });
  return (
    <LayerHost data-fit-screen="">
      <FullView
        headingId="friend-collection-title"
        title={collectionTitle(loaded.value?.friend.name ?? null)}
        back={{ label: tx("friendCollection.back"), to: PATHS.friends }}
        actions={[
          <FriendEquipmentOpener key="equipment" />,
          <FriendEndMenu key="more" disabled={loaded.value === undefined} />,
        ]}
      >
        <LoadFrame
          queryKey={queryKey}
          token={props.token}
          load={load}
          loadingText={tx("friendCollection.loading")}
          loadingFallback={<FriendCollectionSkeleton label={tx("friendCollection.loading")} />}
        >
          {(data) => (
            <>
              <FriendCards
                name={nameOf(data.friend.name)}
                cards={data.cards}
                api={api}
                token={props.token}
              />
              <LayerSheet id={EQUIPMENT_LAYER} title={tx("friendCollection.devicesOf", { name })}>
                <FriendEquipment api={api} token={props.token} friendId={friendId} name={name} />
              </LayerSheet>
              <FriendEndLayer
                name={name}
                busy={ending.running}
                error={ending.error}
                onYes={onYes}
              />
            </>
          )}
        </LoadFrame>
      </FullView>
    </LayerHost>
  );
}

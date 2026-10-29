import type { ComponentProps } from "react";
import { PagedGroups } from "@/components/shared/responsive/paged-groups/paged-groups";
import { ViewLayer } from "@/components/sammlung-header/view-layer/view-layer";
import { CollectionPage } from "../../collection-page/collection-page";
import { PlantsViewOpener } from "./view-opener/view-opener";

type Group = "all" | "phase" | "location";
type PartProps =
  | { part: "opener" }
  | ({ part: "layer" } & ComponentProps<typeof ViewLayer<Group>>)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the caller's entry type
  | ({ part: "groups" } & ComponentProps<typeof PagedGroups<any>>);

/**
 * The entry of the lazy chunk of the plants (US-QS-19): the page, or one of the parts that the app wires around it, the
 * opener "Ansicht", its layer and the paged groups that `care` reuses for the care phases. They share one export,
 * because every export of the module costs bytes in the initial JavaScript (QG-U6); all of them load as one chunk.
 */
export function PlantsEntry(props: ComponentProps<typeof CollectionPage> | PartProps) {
  if (!("part" in props)) return <CollectionPage {...props} />;
  if (props.part === "opener") return <PlantsViewOpener />;
  if (props.part === "layer") return <ViewLayer {...props} />;
  return <PagedGroups {...props} />;
}

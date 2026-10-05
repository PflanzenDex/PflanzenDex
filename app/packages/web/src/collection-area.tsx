import { Suspense, useState } from "react";
import type { Species } from "@pflanzendex/core";
import { CollectionPage } from "./collection";
import { MeasurePage } from "./care";
import { PageSkeleton } from "@/components/shared/page-skeleton";

type Token = () => Promise<string | undefined>;

/**
 * The area "Collection": list and create from `collection`, measuring from `care`. The app wires both modules (they do
 * not know each other); the specimen currently being measured is remembered by this area (US-WAC-01).
 */
export function CollectionArea(props: {
  api: string;
  token: Token;
  newSpecies: Species | null;
  onSpeciesChoose: () => void;
  onCompleted: () => void;
}) {
  const [measure, setMeasure] = useState<{ id: string; name: string } | null>(null);
  // The measure page is its own lazy part: the area stays and shows a skeleton while it loads (DS-55).
  return measure ? (
    <Suspense fallback={<PageSkeleton />}>
      <MeasurePage
        api={props.api}
        token={props.token}
        specimen={measure}
        onBack={() => setMeasure(null)}
      />
    </Suspense>
  ) : (
    <CollectionPage {...props} onMeasure={setMeasure} />
  );
}

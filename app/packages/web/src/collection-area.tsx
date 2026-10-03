import { useState } from "react";
import type { Species } from "@pflanzendex/core";
import { CollectionPage } from "./collection";
import { MeasurePage } from "./care";

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
  return measure ? (
    <MeasurePage
      api={props.api}
      token={props.token}
      specimen={measure}
      onBack={() => setMeasure(null)}
    />
  ) : (
    <CollectionPage {...props} onMeasure={setMeasure} />
  );
}

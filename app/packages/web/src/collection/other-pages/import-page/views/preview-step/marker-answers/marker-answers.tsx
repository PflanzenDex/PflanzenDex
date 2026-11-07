// The markers the file needs for existing specimens (US-BES-03, US-BES-18): one field per specimen that has none yet. The
// answer goes to the server as a new preview; a specimen with an answer leaves this list.
import { useState } from "react";
import type { MarkerRequest } from "@pflanzendex/core";
import { texts } from "@/shared/lib/text-rules/texts";
import { Button } from "@/shared/ui/button/button";
import { Label } from "@/shared/ui/display/label/label";
import { Input } from "@/shared/ui/fields/input/input";
import type { MarkerAnswer } from "../../../import-api";
import table from "../../../import-page.de.json";

const ui = texts(table);

/** One specimen without a marker: its field and its own "Kennzeichen übernehmen" (a blank answer is not sent). */
function AnswerField(props: {
  speciesId: string;
  missing: { readonly id: string; readonly name: string };
  onAnswer: (a: MarkerAnswer) => void;
}) {
  const { speciesId, missing } = props;
  const [marker, setMarker] = useState("");
  const id = `import-answer-${missing.id}`;
  const text = marker.trim();
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (text !== "") props.onAnswer({ specimenId: missing.id, speciesId, marker: text });
      }}
    >
      <Label htmlFor={id}>{ui("markerFor", { name: missing.name })}</Label>
      <Input id={id} value={marker} onChange={(e) => setMarker(e.target.value)} />
      <div>
        <Button type="submit" variant="outline" size="touch" disabled={text === ""}>
          {ui("markerSave")}
        </Button>
      </div>
    </form>
  );
}

export function MarkerAnswers(props: {
  requests: readonly MarkerRequest[];
  onAnswer: (a: MarkerAnswer) => void;
}) {
  if (props.requests.length === 0) return null;
  return (
    <section className="flex flex-col gap-3 rounded-control border border-border p-3">
      <h3 className="m-0 text-base font-semibold">{ui("markersHeading")}</h3>
      <p className="m-0 text-sm">{ui("markersText")}</p>
      {props.requests.map((request) => (
        <div key={request.speciesId} className="flex flex-col gap-3">
          <p className="m-0 text-sm font-semibold">
            {ui("markersSpecies", { species: request.speciesName })}
          </p>
          {request.missing.map((missing) => (
            <AnswerField
              key={missing.id}
              speciesId={request.speciesId}
              missing={missing}
              onAnswer={props.onAnswer}
            />
          ))}
        </div>
      ))}
    </section>
  );
}

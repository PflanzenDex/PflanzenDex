// The fixes of one row (US-BES-18): a species chosen from the candidates, a marker for the row, a skip, and taking a skip back.
// Each fix sends the file again; the server judges the row (P-01). Every control is a button or a labelled field.
import { useState } from "react";
import type { PreviewRow } from "@pflanzendex/core";
import { texts } from "@/shared/lib/text-rules/texts";
import { Button } from "@/shared/ui/button/button";
import { Label } from "@/shared/ui/display/label/label";
import { Input } from "@/shared/ui/fields/input/input";
import type { RowFix } from "../../../../import-api";
import table from "../../../../import-page.de.json";

const ui = texts(table);
type Row = PreviewRow;
type OnFix = (line: number, change: RowFix) => void;

/** The candidates of a name that matches no species exactly: the keeper picks one of them (US-BES-18). */
function Candidates(props: { row: Row; onFix: OnFix }) {
  const { row, onFix } = props;
  if (row.species.candidates.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {row.species.candidates.map((c) => (
          <Button
            key={c.id}
            type="button"
            variant="outline"
            size="touch"
            onClick={() => onFix(row.line, { speciesId: c.id })}
          >
            {ui("chooseSpecies", { name: c.name })}
          </Button>
        ))}
      </div>
      {row.species.more ? (
        <p className="m-0 text-sm text-muted-foreground">{ui("moreCandidates")}</p>
      ) : null}
    </div>
  );
}

/** The marker of the row: the field keeps its text; an empty field means no marker (US-BES-03). */
function MarkerFix(props: { row: Row; onFix: OnFix }) {
  const { row, onFix } = props;
  const [marker, setMarker] = useState(row.marker ?? "");
  const id = `import-marker-${row.line}`;
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onFix(row.line, { marker: marker.trim() });
      }}
    >
      <Label htmlFor={id}>{ui("markerLabel")}</Label>
      <Input
        id={id}
        value={marker}
        aria-describedby={`${id}-hint`}
        onChange={(e) => setMarker(e.target.value)}
      />
      <p id={`${id}-hint`} className="m-0 text-sm text-muted-foreground">
        {ui("markerHint")}
      </p>
      <div>
        <Button type="submit" variant="outline" size="touch">
          {ui("markerSave")}
        </Button>
      </div>
    </form>
  );
}

/** The fixes a row offers: a skipped row can be taken back; a flagged or ready row can be skipped (P-09). */
export function RowFixControls(props: { row: Row; onFix: OnFix }) {
  const { row, onFix } = props;
  if (row.state === "skipped")
    return (
      <div>
        <Button
          type="button"
          variant="outline"
          size="touch"
          onClick={() => onFix(row.line, { skip: false })}
        >
          {ui("unskip")}
        </Button>
      </div>
    );
  const needsMarker = row.state === "flagged" && row.reasons.some((r) => r.field === "nickname");
  return (
    <div className="flex flex-col gap-3">
      {row.state === "flagged" ? <Candidates row={row} onFix={onFix} /> : null}
      {needsMarker ? <MarkerFix row={row} onFix={onFix} /> : null}
      <div>
        <Button
          type="button"
          variant="ghost"
          size="touch"
          onClick={() => onFix(row.line, { skip: true })}
        >
          {ui("skip")}
        </Button>
      </div>
    </div>
  );
}

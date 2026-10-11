import { useState } from "react";
import { Button } from "@/components/ui/button/button";
import { Textarea } from "@/components/ui/fields/textarea/textarea";

/** A small form for a reason (optional) or a proposal (required) of a swap answer (US-SOZ-10). */
export function ReasonForm(props: {
  label: string;
  submit: string;
  required: boolean;
  busy: boolean;
  onSend: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const [missing, setMissing] = useState(false);
  return (
    <div className="grid gap-2">
      <label className="grid gap-1 text-sm font-medium">
        {props.label}
        <Textarea value={text} rows={2} maxLength={500} onChange={(e) => setText(e.target.value)} />
      </label>
      {missing && (
        <p role="alert" className="text-sm text-destructive">
          Schreibe, was du statt dessen möchtest.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="touch"
          disabled={props.busy}
          onClick={() => {
            const t = text.trim();
            if (props.required && !t) return setMissing(true);
            props.onSend(t);
          }}
        >
          {props.submit}
        </Button>
        <Button type="button" size="touch" variant="outline" onClick={props.onCancel}>
          Abbrechen
        </Button>
      </div>
    </div>
  );
}

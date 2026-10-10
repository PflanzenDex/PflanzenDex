import { useState } from "react";
import type { ExchangeOffer } from "@pflanzendex/core";
import { OFFER_LIMITS } from "@pflanzendex/core";
import { Button } from "@/components/ui/button/button";
import { FormRoot } from "@/components/ui/fields/form/form";
import { Select } from "@/components/ui/fields/select/select";
import { Textarea } from "@/components/ui/fields/textarea/textarea";
import type { RequestInput } from "../../../api/exchange-api";

function CounterFields(props: {
  choices: readonly { id: string; name: string }[];
  specimen: string;
  text: string;
  onSpecimen: (id: string) => void;
  onText: (text: string) => void;
}) {
  return (
    <>
      <label className="grid gap-1 text-sm font-medium">
        Eigenes Exemplar als Gegenangebot
        <Select value={props.specimen} onChange={(e) => props.onSpecimen(e.target.value)}>
          <option value="">Offen lassen</option>
          {props.choices.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </label>
      <p className="text-sm text-muted-foreground">
        Zur Wahl stehen nur Exemplare, die du für Freunde freigegeben hast.
      </p>
      <label className="grid gap-1 text-sm font-medium">
        Was bietest du an? (optional)
        <Textarea
          value={props.text}
          rows={2}
          maxLength={OFFER_LIMITS.note.max}
          onChange={(e) => props.onText(e.target.value)}
        />
      </label>
    </>
  );
}

/**
 * The request of one offer (US-SOZ-09). For the mode swap the requester may attach one own specimen that is shared with
 * friends as the counter-offer and/or write what is offered in return, or leave the return open; a gift has nothing to
 * attach. The server decides again (P-03); a refusal is shown by the parent and keeps the form (P-10).
 */
export function RequestForm(props: {
  offer: ExchangeOffer;
  title: string;
  choices: readonly { id: string; name: string }[];
  busy: boolean;
  onSend: (input: RequestInput) => void;
  onCancel: () => void;
}) {
  const { offer } = props;
  const [specimen, setSpecimen] = useState("");
  const [text, setText] = useState("");
  const swap = offer.mode === "swap";
  const send = () => {
    const input: RequestInput = {};
    if (swap && specimen) input.counterSpecimenId = specimen;
    if (swap && text.trim()) input.counterText = text.trim();
    props.onSend(input);
  };
  return (
    <FormRoot aria-label={`Anfrage: ${props.title}`} className="grid gap-2" onSubmit={send}>
      {swap && (
        <CounterFields
          choices={props.choices}
          specimen={specimen}
          text={text}
          onSpecimen={setSpecimen}
          onText={setText}
        />
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="touch" disabled={props.busy}>
          Anfrage senden
        </Button>
        <Button type="button" size="touch" variant="outline" onClick={props.onCancel}>
          Abbrechen
        </Button>
      </div>
    </FormRoot>
  );
}

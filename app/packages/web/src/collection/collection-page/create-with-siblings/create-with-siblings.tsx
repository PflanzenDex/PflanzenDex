import type { Species } from "@pflanzendex/core";
import { RequestState } from "@/shared/patterns/states/request-state/request-state";
import { CreateForm } from "../../specimens/create/create-form/create-form";
import { useSiblings } from "../../specimens/cards/use-card-pages";
import type { Token } from "../../specimens/hooks/use-collection";
import type { useCreate } from "../../specimens/create/use-create";
import type { Loaded } from "../../specimens/hooks/use-collection";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "./create-with-siblings.de.json";
import { CreateFormSkeleton } from "./create-with-siblings.skeleton";

const ui = texts(table);

/**
 * The create form of a chosen species. The other plants of the species (US-BES-03) are read to the end first, because the
 * marker rule needs every one of them; a failed read is shown with its retry, never a form that guesses (P-10).
 */
export function CreateWithSiblings(p: {
  species: Species;
  api: string;
  token: Token;
  data: Loaded;
  create: ReturnType<typeof useCreate>;
  onCancel: () => void;
}) {
  const siblings = useSiblings(p.api, p.token, p.species.id);
  return (
    <RequestState
      status={siblings.status}
      {...(siblings.error ? { errorText: siblings.error.text } : {})}
      onRetry={siblings.retry}
      skeleton={<CreateFormSkeleton label={ui("loading")} />}
    >
      {siblings.value && (
        <CreateForm
          species={p.species}
          siblings={siblings.value}
          locations={p.data.locations}
          zones={p.create.zones}
          onSend={p.create.send}
          onCancel={p.onCancel}
        />
      )}
    </RequestState>
  );
}

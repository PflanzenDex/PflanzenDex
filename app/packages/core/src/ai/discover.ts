// Discover through the AI client (US-ENT-08): the client reads the same suggestions as the view (order and reasons are
// computed by the code, KI-R1, KI-R2) and sends "Yes" or "No" like the swipe buttons. With the right "write" the decision
// runs at once through `discover.decide`, with "create drafts" it arrives as a draft the keeper adopts (KI-R3, KI-R8).
import { appError, failed, ok, type Result } from "../kernel";
import type { AiDraft, DraftStore } from "./drafts";
import { mayCall, type AiRights } from "./rights";
import type { AiLogStore } from "./status";

/** The discover operations behind a port, so `ai` does not depend on the module `discover`. */
export interface DiscoverSource {
  suggestions(
    userId: string,
    timeZone: string,
    options: { deck: number; zone?: number },
  ): Promise<unknown>;
  /** Validates the input like the swipe buttons; the same schema checks a draft of the type `discover_decision`. */
  readonly schema: (
    input: unknown,
  ) => Result<{ species: string; decision: "yes" | "no" | "later" }>;
  decide(userId: string, input: unknown, key: string): Promise<Result<unknown>>;
}

export interface DiscoverCall {
  readonly userId: string;
  readonly connectionId: string;
  readonly rights: AiRights;
  readonly now: Date;
}

/** The deck of the account for the client; read right, logged without content. */
export async function aiDiscoverSuggestions(
  deps: { readonly discover: DiscoverSource; readonly log: AiLogStore },
  call: DiscoverCall & { timeZone: string; deck: number; zone?: number },
): Promise<Result<{ deck: unknown; dataFields: readonly string[] }>> {
  if (!mayCall(call.rights, "discover_suggestions"))
    return failed(appError("ai.scope_insufficient"));
  const deck = await deps.discover.suggestions(call.userId, call.timeZone, {
    deck: call.deck,
    ...(call.zone === undefined ? {} : { zone: call.zone }),
  });
  await deps.log.record(
    call.userId,
    {
      connectionId: call.connectionId,
      operation: "discover_suggestions",
      effect: "read: one deck",
    },
    call.now,
  );
  return ok({
    deck,
    dataFields: ["suggestions[].species", "suggestions[].germanName", "suggestions[].reasons"],
  });
}

export type DiscoverOutcome =
  | { readonly mode: "written"; readonly result: unknown }
  | { readonly mode: "draft"; readonly draft: AiDraft; readonly created: boolean }
  | { readonly mode: "none" };

/**
 * "Yes" or "No" for a suggested species. "Later" writes nothing. With the right "write" the wish is written through
 * `discover.decide` (same effect as US-ENT-04); with "create drafts" a draft of the type `discover_decision` is stored
 * and the keeper adopts it in the app. The call is logged either way (P-10).
 */
export async function aiDiscoverDecide(
  deps: {
    readonly discover: DiscoverSource;
    readonly drafts: DraftStore;
    readonly log: AiLogStore;
  },
  call: DiscoverCall & { input: unknown; key: string },
): Promise<Result<DiscoverOutcome>> {
  if (!mayCall(call.rights, "discover_draft")) return failed(appError("ai.scope_insufficient"));
  const input = deps.discover.schema(call.input);
  if (!input.ok) return input;
  const record = (effect: string) =>
    deps.log.record(
      call.userId,
      { connectionId: call.connectionId, operation: "discover_decide", effect },
      call.now,
    );
  if (input.value.decision === "later") {
    await record("later: nothing written");
    return ok({ mode: "none" });
  }
  if (mayCall(call.rights, "discover_decide")) {
    const done = await deps.discover.decide(call.userId, call.input, call.key);
    if (!done.ok) return done;
    await record(`written: ${input.value.decision}`);
    return ok({ mode: "written", result: done.value });
  }
  const content = call.input as Record<string, unknown>;
  const stored = await deps.drafts.create(
    call.userId,
    {
      connectionId: call.connectionId,
      type: "discover_decision",
      reference: input.value.species,
      content,
      contentKey: JSON.stringify([input.value.species, input.value.decision, content["timeZone"]]),
      source: "Vorschlag der App („Entdecken“)",
    },
    call.now,
  );
  await record(`draft: ${input.value.decision}${stored.created ? "" : " (already open)"}`);
  return ok({ mode: "draft", ...stored });
}

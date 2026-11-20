// One write of the collection through the AI client (US-KI-14, KI-R10): the references are resolved within the account,
// then the very operation of the app's form runs (FR-KI-14) with the same idempotency key, error codes and date rules.
// With the right "write" it runs at once; with "create drafts" only a draft of the same content arises and the answer
// names the right to request (step-up, US-KI-07). Every call is logged with ids and codes, never content (FR-KI-19).
import { appError, failed, ok, type Result, type Schema } from "../../../kernel";
import type { AiDraft, DraftStore } from "../../drafts";
import { AI_SCOPES, mayCall, type AiRights } from "../../rights";
import type { AiLogStore } from "../../status";
import type { CollectionReadSource } from "../types";
import { resolveWrite, type SpecimenWrite } from "./specimen-writes";
import { collectionView, type CollectionView, type SpecimenOut } from "./views";

/** The app's operation behind a write tool, bound to its idempotency store (P-03): the one the app route runs. */
export interface WriteRunner {
  /** `<domain>.<verb>` of the operation, e.g. `specimen.create`. */
  readonly name: string;
  readonly schema: Schema<unknown>;
  readonly run: (userId: string, input: unknown, key: string) => Promise<Result<unknown>>;
}
export type SpecimenWriteSource = Readonly<Record<SpecimenWrite, WriteRunner>>;

export interface WriteDependencies {
  readonly source: CollectionReadSource;
  readonly writes: SpecimenWriteSource;
  readonly drafts: DraftStore;
  readonly log: AiLogStore;
}

export interface WriteCall {
  readonly userId: string;
  readonly connectionId: string;
  readonly rights: AiRights;
  readonly now: Date;
  readonly input: unknown;
  readonly key: string;
}

export type WriteOutcome =
  | {
      readonly mode: "written";
      readonly operation: string;
      readonly result: unknown;
      /** The specimen before and after, as the collection shows it; `before` is null for a new one. */
      readonly before: SpecimenOut | null;
      readonly after: SpecimenOut | null;
      readonly dataFields: readonly string[];
    }
  | {
      readonly mode: "draft";
      readonly draft: AiDraft;
      readonly created: boolean;
      /** Writing needs this right; the keeper confirms it in the app (US-KI-07). */
      readonly stepUp: { readonly right: "write"; readonly scope: string };
    };

/** The source a draft of a write names in the inbox (shown to the keeper, German). */
const DRAFT_SOURCE = "Eingabe über den KI-Client";

const DATA = ["before.name", "before.marker", "after.name", "after.marker"];

const specimenIn = (view: CollectionView, id: string | null) =>
  id === null ? null : (view.specimens.find((s) => s.id === id) ?? null);

const idOf = (value: unknown): string | null => {
  const id = (value as { id?: unknown } | null)?.id;
  return typeof id === "string" ? id : null;
};

/** Draft or write of one specimen operation; the right "create drafts" is the least the route lets through. */
export async function aiSpecimenWrite(
  deps: WriteDependencies,
  write: SpecimenWrite,
  call: WriteCall,
): Promise<Result<WriteOutcome>> {
  if (!mayCall(call.rights, "propose_draft")) return failed(appError("ai.scope_insufficient"));
  const runner = deps.writes[write];
  const record = (effect: string) =>
    deps.log.record(
      call.userId,
      { connectionId: call.connectionId, operation: write, effect },
      call.now,
    );
  const resolved = await resolveWrite(
    { source: deps.source, log: deps.log },
    call.userId,
    write,
    call.input,
  );
  if (!resolved.ok) {
    await record(`refused: ${resolved.error.code}`);
    return resolved;
  }
  // The operation's own check before a draft is stored: a draft that adopting would refuse is no draft (US-KI-03).
  const checked = runner.schema(resolved.value.input);
  if (!checked.ok) {
    await record(`refused: ${checked.error.code}`);
    return checked;
  }
  const { input, specimenId, view } = resolved.value;
  if (!mayCall(call.rights, write))
    return draftOf(deps, call, { write, content: input, specimenId }, record);
  const done = await runner.run(call.userId, input, call.key);
  if (!done.ok) {
    await record(`refused: ${done.error.code}`);
    return done;
  }
  const target = specimenId ?? idOf(done.value);
  const after = await collectionView(deps.source, call.userId, "UTC");
  await record(`written: ${runner.name}${target ? ` ${target}` : ""}`);
  return ok({
    mode: "written",
    operation: runner.name,
    result: done.value,
    before: specimenIn(view, specimenId),
    after: specimenIn(after, target),
    dataFields: DATA,
  });
}

/** With "create drafts" only: the resolved content becomes a draft the keeper adopts through the same operation. */
async function draftOf(
  deps: WriteDependencies,
  call: WriteCall,
  draft: {
    readonly write: SpecimenWrite;
    readonly content: Readonly<Record<string, unknown>>;
    readonly specimenId: string | null;
  },
  record: (effect: string) => Promise<void>,
): Promise<Result<WriteOutcome>> {
  const { write, content, specimenId } = draft;
  const stored = await deps.drafts.create(
    call.userId,
    {
      connectionId: call.connectionId,
      type: write,
      reference: specimenId,
      content,
      contentKey: JSON.stringify([write, content]),
      source: DRAFT_SOURCE,
    },
    call.now,
  );
  await record(`draft${stored.created ? "" : " (already open)"}: ${specimenId ?? "new specimen"}`);
  return ok({ mode: "draft", ...stored, stepUp: { right: "write", scope: AI_SCOPES.write } });
}

// Drafts of the AI client (US-KI-09, DM-KI-03, KI-R3): content results are proposals. The client delivers them with the
// right "create drafts"; nothing counts until the keeper adopts it, and adopting runs through the same validating
// operation as the form (KI-R1, P-03). Incomplete content is never stored (US-KI-03).
import {
  appError,
  defineOperation,
  failed,
  idField,
  ok,
  shape,
  type Result,
  type Schema,
} from "../kernel";

export type DraftStatus = "open" | "adopted" | "discarded" | "expired";

export interface AiDraft {
  readonly id: string;
  readonly connectionId: string;
  readonly clientName: string;
  readonly type: string;
  readonly reference: string | null;
  readonly content: unknown;
  readonly source: string;
  readonly status: DraftStatus;
  readonly createdAt: string;
  readonly decidedAt: string | null;
}

/** A kind of draft: the schema of the target operation and the way to adopt it through that operation. */
export interface DraftType {
  readonly schema: Schema<unknown>;
  /** Runs the validating operation of the form as the keeper; the key makes a repeat write once. */
  readonly adopt: (userId: string, content: unknown, key: string) => Promise<Result<unknown>>;
}
export type DraftTypes = Readonly<Record<string, DraftType>>;

/** Port: drafts of the own account only (P-04). */
export interface DraftStore {
  /** `created: false` returns the already open draft with the same content. */
  create(
    userId: string,
    draft: {
      connectionId: string;
      type: string;
      reference: string | null;
      content: unknown;
      contentKey: string;
      source: string;
    },
    now: Date,
  ): Promise<{ draft: AiDraft; created: boolean }>;
  /** Newest first; open drafts older than `DRAFT_EXPIRY_DAYS` come back as `expired`. */
  list(userId: string, now: Date): Promise<readonly AiDraft[]>;
  find(userId: string, id: string, now: Date): Promise<AiDraft | null>;
  /** Moves an open, not expired draft to the status; `false` if it is not open any more. */
  decide(
    userId: string,
    id: string,
    status: "adopted" | "discarded" | "open",
    now: Date,
  ): Promise<boolean>;
}

export interface DraftDependencies {
  readonly drafts: DraftStore;
  readonly types: DraftTypes;
}

/** An open draft expires after 14 days (assumption, DM-KI-03). */
export const DRAFT_EXPIRY_DAYS = 14;

/** The drafts of the account for the inbox, newest first, with the connection that delivered them (US-KI-09). */
export const aiDrafts = (deps: Pick<DraftDependencies, "drafts">, userId: string, now: Date) =>
  deps.drafts.list(userId, now);

const decision = shape({ id: idField("id") });

/**
 * Adopts a draft (US-KI-09): the content, or the keeper's changed content, runs through the validating operation of the
 * form. A draft is never adopted automatically. If the operation refuses (for example a duplicate name), the draft
 * stays open and the refusal is returned unchanged.
 */
export const aiAdoptDraft = (deps: DraftDependencies, now: () => Date = () => new Date()) =>
  defineOperation({
    name: "ai.adopt_draft",
    schema: (input: unknown) => {
      const r = decision(input);
      return r.ok ? ok({ ...r.value, changes: (input as { content?: unknown }).content }) : r;
    },
    run: async ({ userId }, input) => {
      const draft = await deps.drafts.find(userId, input.id, now());
      if (!draft) return failed(appError("ai.draft_not_found"));
      const type = deps.types[draft.type];
      if (!type || draft.status !== "open") return failed(appError("ai.draft_closed"));
      const raw = input.changes === undefined ? draft.content : input.changes;
      const content = type.schema(raw);
      if (!content.ok) return content;
      if (!(await deps.drafts.decide(userId, draft.id, "adopted", now())))
        return failed(appError("ai.draft_closed"));
      const done = await type.adopt(userId, raw, `ai-draft:${draft.id}`);
      if (!done.ok) {
        await deps.drafts.decide(userId, draft.id, "open", now());
        return done;
      }
      return ok({ id: draft.id, status: "adopted" as const, result: done.value });
    },
  });

/** Discards a draft; it stays viewable as discarded (US-KI-09). */
export const aiDiscardDraft = (deps: DraftDependencies, now: () => Date = () => new Date()) =>
  defineOperation({
    name: "ai.discard_draft",
    schema: decision,
    run: async ({ userId }, input) => {
      const draft = await deps.drafts.find(userId, input.id, now());
      if (!draft) return failed(appError("ai.draft_not_found"));
      if (!(await deps.drafts.decide(userId, draft.id, "discarded", now())))
        return failed(appError("ai.draft_closed"));
      return ok({ id: draft.id, status: "discarded" as const });
    },
  });

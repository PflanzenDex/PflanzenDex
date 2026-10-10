import { describe, expect, it } from "vitest";
import { appError, execute, failed, ok, shape, textField } from "../kernel";
import { InMemoryIdempotencyStore } from "../kernel/test-helpers";
import { aiAdoptDraft, aiDiscardDraft, aiDrafts, aiProposeDraft, type DraftTypes } from "./drafts";
import { InMemoryAiLog, InMemoryDrafts } from "./test-helpers";

const now = new Date("2026-10-10T08:00:00Z");
const idempotency = new InMemoryIdempotencyStore();
const adopted: unknown[] = [];
const types = (refuse = false): DraftTypes => ({
  wish: {
    schema: shape({ name: textField("name", { min: 1, max: 50 }) }),
    adopt: async (_user, content) => {
      if (refuse) return failed(appError("wish.name_taken"));
      adopted.push(content);
      return ok({ created: true });
    },
  },
});
const setup = (refuse = false) => ({
  drafts: new InMemoryDrafts(),
  log: new InMemoryAiLog(),
  types: types(refuse),
});
const propose = (
  s: ReturnType<typeof setup>,
  over: Record<string, unknown> = {},
  rights = "drafts" as const,
) =>
  aiProposeDraft(s, {
    userId: "anna",
    connectionId: "c1",
    rights,
    now,
    input: { type: "wish", source: "https://example.test/a", content: { name: "Aloe" }, ...over },
  });
const call = (userId: string | null, input: unknown) => ({
  context: { userId, timeZone: "Europe/Berlin" },
  input,
  idempotencyKey: crypto.randomUUID(),
});
const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? "ok" : r.error?.code);

describe("US-KI-09 drafts instead of writing", () => {
  it("US-KI-09 US-KI-05 delivers a draft with source and connection, nothing is adopted by itself", async () => {
    adopted.length = 0;
    const s = setup();
    const r = await propose(s);
    expect(r.ok && r.value.created).toBe(true);
    expect((await aiDrafts(s, "anna", now))[0]).toMatchObject({
      type: "wish",
      status: "open",
      source: "https://example.test/a",
      connectionId: "c1",
    });
    expect(adopted).toEqual([]);
  });

  it("US-KI-09 needs the right 'create drafts' (KI-R8): a read connection stores nothing", async () => {
    const s = setup();
    expect(code(await propose(s, {}, "read" as never))).toBe("ai.scope_insufficient");
    expect(s.drafts.rows).toEqual([]);
  });

  it("US-KI-03 refuses a missing source, an unknown type and incomplete content; nothing is stored", async () => {
    const s = setup();
    expect(code(await propose(s, { source: "" }))).toBe("input.invalid");
    expect(code(await propose(s, { type: "profile" }))).toBe("input.invalid");
    const bad = await propose(s, { content: {} });
    expect(!bad.ok && bad.error.details?.[0]?.field).toBe("name");
    expect(s.drafts.rows).toEqual([]);
  });

  it("US-KI-09 delivering the same content twice keeps one open draft", async () => {
    const s = setup();
    await propose(s);
    const again = await propose(s);
    expect(again.ok && again.value.created).toBe(false);
    expect(s.drafts.rows).toHaveLength(1);
  });

  it("US-KI-10 every delivery is logged with the type only", async () => {
    const s = setup();
    await propose(s);
    expect(s.log.rows[0]).toMatchObject({ operation: "propose_draft", effect: "draft: wish" });
  });

  it("US-KI-09 adopting runs the operation of the form once and the draft shows as adopted", async () => {
    adopted.length = 0;
    const s = setup();
    await propose(s);
    const id = s.drafts.rows[0]?.id;
    const op = aiAdoptDraft(s, () => now);
    expect(code(await execute(op, { idempotency }, call("anna", { id })))).toBe("ok");
    expect(adopted).toEqual([{ name: "Aloe" }]);
    expect((await aiDrafts(s, "anna", now))[0]?.status).toBe("adopted");
    expect(code(await execute(op, { idempotency }, call("anna", { id })))).toBe("ai.draft_closed");
  });

  it("US-KI-09 change and adopt: the keeper's content is validated by the same schema", async () => {
    adopted.length = 0;
    const s = setup();
    await propose(s);
    const id = s.drafts.rows[0]?.id;
    const op = aiAdoptDraft(s, () => now);
    expect(code(await execute(op, { idempotency }, call("anna", { id, content: {} })))).toBe(
      "input.invalid",
    );
    expect(
      code(
        await execute(op, { idempotency }, call("anna", { id, content: { name: "Aloe vera" } })),
      ),
    ).toBe("ok");
    expect(adopted).toEqual([{ name: "Aloe vera" }]);
  });

  it("US-KI-09 a refusal of the operation leaves the draft open and returns the refusal", async () => {
    const s = setup(true);
    await propose(s);
    const id = s.drafts.rows[0]?.id;
    const r = await execute(
      aiAdoptDraft(s, () => now),
      { idempotency },
      call("anna", { id }),
    );
    expect(code(r)).toBe("wish.name_taken");
    expect((await aiDrafts(s, "anna", now))[0]?.status).toBe("open");
  });

  it("US-KI-09 discarded drafts stay viewable and cannot be adopted", async () => {
    const s = setup();
    await propose(s);
    const id = s.drafts.rows[0]?.id;
    expect(
      code(
        await execute(
          aiDiscardDraft(s, () => now),
          { idempotency },
          call("anna", { id }),
        ),
      ),
    ).toBe("ok");
    expect((await aiDrafts(s, "anna", now))[0]?.status).toBe("discarded");
    expect(
      code(
        await execute(
          aiAdoptDraft(s, () => now),
          { idempotency },
          call("anna", { id }),
        ),
      ),
    ).toBe("ai.draft_closed");
  });

  it("US-KI-09 an open draft expires after 14 days, stays viewable and cannot be adopted", async () => {
    const s = setup();
    await propose(s);
    const id = s.drafts.rows[0]?.id;
    const later = new Date(now.getTime() + 15 * 86400000);
    expect((await aiDrafts(s, "anna", later))[0]?.status).toBe("expired");
    expect(
      code(
        await execute(
          aiAdoptDraft(s, () => later),
          { idempotency },
          call("anna", { id }),
        ),
      ),
    ).toBe("ai.draft_closed");
  });

  it("US-KI-09 KI-R6 a stranger sees, adopts and discards nothing of another account", async () => {
    adopted.length = 0;
    const s = setup();
    await propose(s);
    const id = s.drafts.rows[0]?.id;
    expect(await aiDrafts(s, "ben", now)).toEqual([]);
    expect(
      code(
        await execute(
          aiAdoptDraft(s, () => now),
          { idempotency },
          call("ben", { id }),
        ),
      ),
    ).toBe("ai.draft_not_found");
    expect(
      code(
        await execute(
          aiDiscardDraft(s, () => now),
          { idempotency },
          call("ben", { id }),
        ),
      ),
    ).toBe("ai.draft_not_found");
    expect(adopted).toEqual([]);
  });
});

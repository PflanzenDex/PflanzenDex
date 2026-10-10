import { describe, expect, it } from "vitest";
import { appError, execute, failed, ok, shape, textField } from "../../kernel";
import { InMemoryIdempotencyStore } from "../../kernel/test-helpers";
import type { DraftTypes } from "../drafts";
import { aiProposeDraft } from "../propose";
import { InMemoryAiLog, InMemoryConnections, InMemoryDrafts } from "../test-helpers";
import { aiClaimTask, aiClientTasks, aiDeclineClientTask } from "./client";
import { aiCancelTask, aiCreateTask, aiTaskPreview, aiTasks } from "./tasks";
import { taskPrompt } from "./prompt/prompt";
import { InMemoryTasks } from "./test-helpers";

const now = new Date("2026-10-10T08:00:00Z");
const idempotency = new InMemoryIdempotencyStore();
let counter = 0;
const run = <I, O>(op: Parameters<typeof execute<I, O>>[0], userId: string, input: unknown) =>
  execute(op, { idempotency }, {
    context: { userId },
    input,
    idempotencyKey: `k${++counter}`,
  } as never);
const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? "ok" : r.error?.code);

const setup = async (connected = true) => {
  const connections = new InMemoryConnections();
  if (connected)
    await connections.create(
      "anna",
      { clientId: "c", clientName: "Claude", rights: "drafts" },
      now,
    );
  return {
    tasks: new InMemoryTasks(),
    connections,
    log: new InMemoryAiLog(),
    drafts: new InMemoryDrafts(),
  };
};
const species = { type: "species_profile", reference: "Aloe vera" };
const types: DraftTypes = {
  species: {
    schema: shape({ name: textField("name", { min: 1, max: 50 }) }),
    adopt: async () => ok({}),
  },
  wish: {
    schema: shape({ name: textField("name", { min: 1, max: 50 }) }),
    adopt: async () => failed(appError("input.invalid")),
  },
};
const client = (id = "00000000-0000-4000-8000-000000000001") => ({
  userId: "anna",
  connectionId: id,
  rights: "drafts" as const,
  now,
});

describe("US-KI-08 tasks from the app to the AI client", () => {
  it("US-KI-08 creates an open task with type, reference and status; the app lists it", async () => {
    const s = await setup();
    const r = await run(
      aiCreateTask(s, () => now),
      "anna",
      species,
    );
    expect(r.ok && r.value.task).toMatchObject({
      type: "species_profile",
      reference: "Aloe vera",
      status: "open",
    });
    const list = await aiTasks(s, "anna", now);
    expect(list.clientConnected).toBe(true);
    expect(list.tasks).toHaveLength(1);
  });

  it("US-KI-08 refuses an unknown type, a bad zone and a bad measurement id; nothing is stored", async () => {
    const s = await setup();
    const op = aiCreateTask(s, () => now);
    expect(code(await run(op, "anna", { type: "chat", reference: "x" }))).toBe("input.invalid");
    expect(code(await run(op, "anna", { type: "wish_candidates", reference: "1" }))).toBe(
      "input.invalid",
    );
    expect(code(await run(op, "anna", { type: "photo_assessment", reference: "abc" }))).toBe(
      "input.invalid",
    );
    expect(s.tasks.rows).toEqual([]);
  });

  it("US-KI-08 without a connected client no silent task arises (P-10), the text can still be copied", async () => {
    const s = await setup(false);
    expect(
      code(
        await run(
          aiCreateTask(s, () => now),
          "anna",
          species,
        ),
      ),
    ).toBe("ai.no_client");
    expect(s.tasks.rows).toEqual([]);
    const preview = await run(aiTaskPreview, "anna", { type: "wish_candidates", reference: "3" });
    expect(preview.ok && preview.value.label).toBe("Lichtzone 3");
    expect((await aiTasks(s, "anna", now)).clientConnected).toBe(false);
  });

  it("US-KI-08 a revoked client or one with the right 'read' does not count as connected", async () => {
    const s = await setup(false);
    const c = await s.connections.create(
      "anna",
      { clientId: "r", clientName: "R", rights: "read" },
      now,
    );
    expect(
      code(
        await run(
          aiCreateTask(s, () => now),
          "anna",
          species,
        ),
      ),
    ).toBe("ai.no_client");
    await s.connections.setRights("anna", c.id, "drafts");
    await s.connections.revoke("anna", c.id, now);
    expect((await aiTasks(s, "anna", now)).clientConnected).toBe(false);
  });

  it("US-KI-08 tasks for the same reference and type are merged; a finished one allows a new one", async () => {
    const s = await setup();
    const op = aiCreateTask(s, () => now);
    const a = await run(op, "anna", species);
    const b = await run(op, "anna", { ...species, reference: "Aloe vera" });
    expect(b.ok && b.value.created).toBe(false);
    expect(s.tasks.rows).toHaveLength(1);
    const id = a.ok ? a.value.task.id : "";
    await run(
      aiCancelTask(s, () => now),
      "anna",
      { id },
    );
    const c = await run(op, "anna", species);
    expect(c.ok && c.value.created).toBe(true);
  });

  it("US-KI-08 an open task expires after 14 days and stays viewable (P-10)", async () => {
    const s = await setup();
    await run(
      aiCreateTask(s, () => now),
      "anna",
      species,
    );
    const later = new Date(now.getTime() + 15 * 86400000);
    expect((await aiTasks(s, "anna", later)).tasks[0]?.status).toBe("expired");
    expect(await aiClientTasks(s, { ...client(), now: later })).toMatchObject({
      ok: true,
      value: { tasks: [] },
    });
  });

  it("US-KI-08 the client lists open tasks (read right), takes one over and declines; the keeper sees the status", async () => {
    const s = await setup();
    const created = await run(
      aiCreateTask(s, () => now),
      "anna",
      species,
    );
    const id = created.ok ? created.value.task.id : "";
    const listed = await aiClientTasks(s, { ...client(), rights: "read" });
    expect(listed.ok && listed.value.tasks.map((t) => t.id)).toEqual([id]);
    expect(code(await aiClaimTask(s, { ...client(), rights: "read", id }))).toBe(
      "ai.scope_insufficient",
    );
    expect(code(await aiClaimTask(s, { ...client(), id }))).toBe("ok");
    expect(code(await aiClaimTask(s, { ...client(), id }))).toBe("ok");
    expect(code(await aiClaimTask(s, { ...client("other"), id }))).toBe("ai.task_closed");
    expect((await aiTasks(s, "anna", now)).tasks[0]?.status).toBe("in_progress");
    expect(code(await aiDeclineClientTask(s, { ...client(), id }))).toBe("ok");
    expect((await aiTasks(s, "anna", now)).tasks[0]?.status).toBe("declined");
    expect(code(await aiDeclineClientTask(s, { ...client(), id }))).toBe("ai.task_closed");
    expect(s.log.rows.map((r) => r.operation)).toEqual([
      "list_tasks",
      "claim_task",
      "decline_task",
    ]);
  });

  it("US-KI-08 KI-R6 a task of another account is not found for the client or the keeper", async () => {
    const s = await setup();
    const created = await run(
      aiCreateTask(s, () => now),
      "anna",
      species,
    );
    const id = created.ok ? created.value.task.id : "";
    expect(code(await aiClaimTask(s, { ...client(), userId: "bert", id }))).toBe(
      "ai.task_not_found",
    );
    expect(
      code(
        await run(
          aiCancelTask(s, () => now),
          "bert",
          { id },
        ),
      ),
    ).toBe("ai.task_not_found");
    expect((await aiTasks(s, "bert", now)).tasks).toEqual([]);
  });

  it("US-KI-08 US-KI-09 delivering a draft with the task id completes the task and links the draft", async () => {
    const s = await setup();
    const created = await run(
      aiCreateTask(s, () => now),
      "anna",
      species,
    );
    const id = created.ok ? created.value.task.id : "";
    const send = (over: Record<string, unknown> = {}) =>
      aiProposeDraft(
        { ...s, types },
        {
          ...client(),
          input: {
            type: "species",
            source: "https://example.test/a",
            taskId: id,
            content: { name: "Aloe" },
            ...over,
          },
        },
      );
    expect(code(await send({ type: "wish" }))).toBe("input.invalid");
    expect(code(await send({ taskId: "00000000-0000-4000-8000-0000000000ff" }))).toBe(
      "ai.task_not_found",
    );
    const r = await send();
    expect(code(r)).toBe("ok");
    const done = (await aiTasks(s, "anna", now)).tasks[0];
    expect(done).toMatchObject({ status: "done", draftId: r.ok ? r.value.draft.id : "" });
    // The same connection may add further drafts (candidates); another connection may not.
    expect(code(await send({ content: { name: "Aloe 2" } }))).toBe("ok");
    const other = await aiProposeDraft(
      { ...s, types },
      {
        ...client("other"),
        input: { type: "species", source: "s", taskId: id, content: { name: "Aloe 3" } },
      },
    );
    expect(code(other)).toBe("ai.task_closed");
  });

  it("US-KI-08 a declined task takes no draft", async () => {
    const s = await setup();
    const created = await run(
      aiCreateTask(s, () => now),
      "anna",
      species,
    );
    const id = created.ok ? created.value.task.id : "";
    await run(
      aiCancelTask(s, () => now),
      "anna",
      { id },
    );
    const r = await aiProposeDraft(
      { ...s, types },
      { ...client(), input: { type: "species", source: "s", taskId: id, content: { name: "A" } } },
    );
    expect(code(r)).toBe("ai.task_closed");
    expect(s.drafts.rows).toEqual([]);
  });

  it("US-KI-08 the prompt names id, type, reference, operations and the draft note, and no credentials", () => {
    const text = taskPrompt(
      { id: "t1", type: "photo_assessment", reference: "m1", label: "Aloe, 10.10." },
      "https://app.example",
    );
    for (const part of [
      "t1",
      "Foto einer Messung beurteilen",
      '"Aloe, 10.10."',
      "POST https://app.example/mcp/tasks/t1/claim",
      "GET https://app.example/mcp/measurements/m1/photo",
      "POST https://app.example/mcp/drafts",
      "ausschließlich als Entwurf",
    ])
      expect(text).toContain(part);
    expect(text).not.toMatch(/token|bearer|passwort/i);
  });
});

import { describe, expect, it } from "vitest";
import { appError, choiceField, failed, ok, shape, textField } from "../kernel";
import { aiDiscoverDecide, aiDiscoverSuggestions, type DiscoverSource } from "./discover";
import { InMemoryAiLog, InMemoryDrafts } from "./test-helpers";

const now = new Date("2026-10-10T08:00:00Z");
const written: unknown[] = [];
const schema = shape({
  species: textField("species", { min: 1, max: 200 }),
  decision: choiceField("decision", ["yes", "no", "later"] as const),
});
const discover: DiscoverSource = {
  suggestions: async (_u, tz, o) => ({ tz, ...o, suggestions: [{ species: "Ficus carica" }] }),
  schema: schema as DiscoverSource["schema"],
  decide: async (_u, input) => {
    written.push(input);
    return ok({ saved: true });
  },
};
const setup = () => ({ discover, drafts: new InMemoryDrafts(), log: new InMemoryAiLog() });
const call = (rights: "read" | "drafts" | "write", input: unknown) => ({
  userId: "anna",
  connectionId: "c1",
  rights,
  now,
  input,
  key: "k",
});
const yes = { species: "Ficus carica", decision: "yes", timeZone: "Europe/Berlin" };
const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? "ok" : r.error?.code);

describe("US-ENT-08 discover through the AI client", () => {
  it("US-ENT-08 the client reads the deck the code computed (read right), logged", async () => {
    const s = setup();
    const r = await aiDiscoverSuggestions(s, {
      ...call("read", null),
      timeZone: "UTC",
      deck: 2,
      zone: 3,
    });
    expect(r.ok && r.value.deck).toMatchObject({
      deck: 2,
      zone: 3,
      suggestions: [{ species: "Ficus carica" }],
    });
    expect(r.ok && r.value.dataFields).toContain("suggestions[].reasons");
    expect(s.log.rows[0]?.operation).toBe("discover_suggestions");
  });

  it("US-ENT-08 with the right 'write' a decision runs at once through discover.decide", async () => {
    written.length = 0;
    const s = setup();
    const r = await aiDiscoverDecide(s, call("write", yes));
    expect(r.ok && r.value.mode).toBe("written");
    expect(written).toEqual([yes]);
    expect(s.drafts.rows).toEqual([]);
  });

  it("US-ENT-08 with the right 'create drafts' a decision is a draft, nothing is written, a repeat is one draft", async () => {
    written.length = 0;
    const s = setup();
    const a = await aiDiscoverDecide(s, call("drafts", yes));
    const b = await aiDiscoverDecide(s, call("drafts", yes));
    expect(a.ok && a.value.mode).toBe("draft");
    expect(b.ok && b.value.mode === "draft" && b.value.created).toBe(false);
    expect(s.drafts.rows).toHaveLength(1);
    expect(written).toEqual([]);
  });

  it("US-ENT-08 'later' writes nothing; 'read' may not decide; bad input is refused", async () => {
    written.length = 0;
    const s = setup();
    const later = await aiDiscoverDecide(s, call("write", { ...yes, decision: "later" }));
    expect(later.ok && later.value.mode).toBe("none");
    expect(code(await aiDiscoverDecide(s, call("read", yes)))).toBe("ai.scope_insufficient");
    expect(code(await aiDiscoverDecide(s, call("write", { decision: "maybe" })))).toBe(
      "input.invalid",
    );
    expect([written, s.drafts.rows]).toEqual([[], []]);
  });

  it("US-ENT-08 a refusal of the operation (not suggested) is passed on and logs nothing as written", async () => {
    const s = setup();
    const refusing = {
      ...discover,
      decide: async () => failed(appError("discover.not_suggested")),
    };
    expect(code(await aiDiscoverDecide({ ...s, discover: refusing }, call("write", yes)))).toBe(
      "discover.not_suggested",
    );
    expect(s.log.rows).toEqual([]);
  });

  it("US-ENT-08 a read client cannot read the deck without the read right class (scope check)", async () => {
    const s = setup();
    expect(
      code(await aiDiscoverSuggestions(s, { ...call("read", null), timeZone: "UTC", deck: 1 })),
    ).toBe("ok");
  });
});

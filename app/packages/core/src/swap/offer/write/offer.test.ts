import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../../../kernel/operation";
import { InMemoryIdempotencyStore } from "../../../kernel/test-helpers";
import type { TreatmentRow } from "../../../care";
import { InMemorySharing } from "../../../social/sharing/test-helpers";
import {
  offerCreate,
  offerList,
  offerPreview,
  offerWithdraw,
  type OfferDependencies,
} from "../index";
import { InMemoryOffers, InMemoryOwnSpecimens, StubPhases } from "../test-helpers";

const S1 = "00000000-0000-4000-8000-0000000000a1";
const S2 = "00000000-0000-4000-8000-0000000000a2";
const S3 = "00000000-0000-4000-8000-0000000000a3";
const FOREIGN = "00000000-0000-4000-8000-0000000000f1";
const anna = { userId: "anna" };
const treatment = (
  id: string,
  specimenId: string,
  doneAt: string | null,
  reason = "Wollläuse",
): TreatmentRow => ({
  id,
  specimenId,
  reason,
  agent: "Spiritus",
  dueAt: "2026-09-01",
  done: doneAt !== null,
  doneAt,
  courseId: null,
});

let offers: InMemoryOffers;
let sharing: InMemorySharing;
let treatments: TreatmentRow[];
let phases: StubPhases;
let idem: InMemoryIdempotencyStore;
let n = 0;
const deps = (): OfferDependencies => ({
  offers,
  sharing,
  phases,
  specimens: new InMemoryOwnSpecimens({
    anna: [
      { id: S1, name: "Haworthia", speciesId: "sp1", status: "plant" },
      { id: S2, name: "Aloe", speciesId: "sp2", status: "archived" },
      { id: S3, name: "Gasteria", speciesId: "sp3", status: "plant" },
    ],
    ben: [{ id: FOREIGN, name: "Ficus", speciesId: "sp4", status: "plant" }],
  }),
  treatments: {
    open: async (_u, ids) =>
      new Map(ids.map((id) => [id, treatments.filter((t) => t.specimenId === id && !t.done)])),
    done: async (_u, id) =>
      treatments
        .filter((t) => t.specimenId === id && t.done)
        .sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? "")),
  },
});
const run = <E, A>(op: Parameters<typeof execute<E, A>>[0], input: unknown, context = anna) =>
  execute(op, { idempotency: idem }, { context, input, idempotencyKey: `k${++n}` });
const create = (input: Record<string, unknown> = {}) =>
  run(offerCreate(deps()), { specimenId: S1, type: "cutting", mode: "swap", ...input });
const errorOf = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? null : r.error?.code);

beforeEach(async () => {
  offers = new InMemoryOffers();
  sharing = new InMemorySharing();
  treatments = [];
  phases = new StubPhases();
  idem = new InMemoryIdempotencyStore();
  await sharing.setMany("anna", [S1, S3], true, false);
});

describe("US-SOZ-08 offer a plant or cutting for swapping", () => {
  it("US-SOZ-08 creates an open offer with type, mode, wish and note", async () => {
    expect(
      await create({
        type: "offshoot",
        mode: "give_away",
        wish: "Ableger",
        note: "Gut bewurzelt.",
      }),
    ).toMatchObject({
      ok: true,
      value: {
        specimenId: S1,
        type: "offshoot",
        mode: "give_away",
        wish: "Ableger",
        note: "Gut bewurzelt.",
        status: "open",
      },
    });
    expect(await create({ specimenId: S3 })).toMatchObject({
      ok: true,
      value: { wish: null, note: null },
    });
  });

  it("US-SOZ-08 an offer needs Share = friends: otherwise a clear error and nothing is written", async () => {
    await sharing.set("anna", S1, false, false);
    expect(errorOf(await create())).toBe("offer.not_shared");
    expect(offers.writes).toBe(0);
  });

  it("US-SOZ-08 a specimen has at most one open offer; withdrawing frees it", async () => {
    const first = await create();
    expect(errorOf(await create())).toBe("offer.already_open");
    expect(
      first.ok && (await run(offerWithdraw(deps()), { offerId: first.value.id })),
    ).toMatchObject({ ok: true, value: { status: "withdrawn" } });
    expect(await create()).toMatchObject({ ok: true });
  });

  it("US-SOZ-08 a specimen with an open treatment is offered only after explicit confirmation", async () => {
    treatments = [treatment("t1", S1, null)];
    expect(errorOf(await create())).toBe("offer.treatment_open");
    expect(errorOf(await create({ confirmTreatment: "yes" }))).toBe("input.invalid");
    expect(offers.writes).toBe(0);
    expect(await create({ confirmTreatment: true })).toMatchObject({ ok: true });
  });

  it("US-SOZ-08 foreign, unknown and archived specimens and bad input write nothing (P-04)", async () => {
    expect(errorOf(await create({ specimenId: FOREIGN }))).toBe("specimen.not_found");
    expect(errorOf(await create({ specimenId: S2 }))).toBe("specimen.archived");
    expect(errorOf(await create({ type: "tree" }))).toBe("input.invalid");
    expect(errorOf(await create({ mode: "sell" }))).toBe("input.invalid");
    expect(errorOf(await create({ wish: "" }))).toBe("input.invalid");
    expect(errorOf(await create({ note: "x".repeat(501) }))).toBe("input.invalid");
    expect(offers.writes).toBe(0);
  });

  it("US-SOZ-08 withdrawing is repeatable; foreign and unknown offers are not found (P-04)", async () => {
    const o = await create();
    const id = o.ok ? o.value.id : "";
    expect(errorOf(await run(offerWithdraw(deps()), { offerId: id }, { userId: "ben" }))).toBe(
      "offer.not_found",
    );
    await run(offerWithdraw(deps()), { offerId: id });
    const writes = offers.writes;
    expect(await run(offerWithdraw(deps()), { offerId: id })).toMatchObject({
      ok: true,
      value: { status: "withdrawn" },
    });
    expect(offers.writes).toBe(writes);
    expect(
      errorOf(
        await run(offerWithdraw(deps()), { offerId: "00000000-0000-4000-8000-0000000000ff" }),
      ),
    ).toBe("offer.not_found");
  });

  it("US-SOZ-08 a handed-over offer cannot be withdrawn (P-10)", async () => {
    const o = await create();
    const row = offers.rows[0];
    if (row) row.status = "handed_over";
    expect(errorOf(await run(offerWithdraw(deps()), { offerId: o.ok ? o.value.id : "" }))).toBe(
      "offer.not_active",
    );
  });
});

describe("US-SOZ-08 health details, phase hint and notice", () => {
  it("US-SOZ-08 the list derives 'treatment open' or 'last treated: reason, date' without agent and notes", async () => {
    treatments = [
      treatment("t1", S1, "2026-09-10", "Wollläuse"),
      treatment("t2", S1, "2026-08-01", "Schildläuse"),
      treatment("t3", S3, null),
    ];
    await create();
    await create({ specimenId: S3, confirmTreatment: true });
    const r = await offerList(deps(), "anna", "Europe/Berlin");
    const [gasteria, haworthia] = r.ok ? r.value.offers : [];
    expect(haworthia?.health).toEqual({
      treatmentOpen: false,
      lastTreated: { reason: "Wollläuse", doneAt: "2026-09-10" },
    });
    expect(gasteria?.health).toEqual({ treatmentOpen: true, lastTreated: null });
    expect(JSON.stringify(r)).not.toContain("Spiritus");
  });

  it("US-SOZ-08 the list names the specimen, the dormancy phase and keeps withdrawn offers (P-10)", async () => {
    phases = new StubPhases({ [S1]: "dormancy" });
    const o = await create();
    await run(offerWithdraw(deps()), { offerId: o.ok ? o.value.id : "" });
    const r = await offerList(deps(), "anna", "Europe/Berlin");
    expect(r.ok && r.value.offers[0]).toMatchObject({
      specimenName: "Haworthia",
      phase: "dormancy",
      status: "withdrawn",
    });
    expect((await offerList(deps(), "anna", "Nowhere/Land")).ok).toBe(false);
  });

  it("US-SOZ-08 the preview says whether sharing is set, an offer exists, and carries the species protection notice", async () => {
    treatments = [treatment("t1", S3, null)];
    const preview = async (id: string) => {
      const r = await offerPreview(deps(), "anna", id, "Europe/Berlin");
      return r.ok ? r.value : null;
    };
    expect(await preview(S1)).toMatchObject({
      shared: true,
      offered: false,
      health: { treatmentOpen: false },
    });
    expect((await preview(S1))?.notice).toMatch(/CITES/);
    await sharing.set("anna", S1, false, false);
    expect((await preview(S1))?.shared).toBe(false);
    expect((await preview(S3))?.health.treatmentOpen).toBe(true);
    await create({ specimenId: S3, confirmTreatment: true });
    expect((await preview(S3))?.offered).toBe(true);
    expect((await offerPreview(deps(), "anna", FOREIGN, "Europe/Berlin")).ok).toBe(false);
  });

  it("US-SOZ-08 offers of another account are not listed (P-04)", async () => {
    await create();
    const r = await offerList(deps(), "ben", "Europe/Berlin");
    expect(r.ok && r.value.offers).toEqual([]);
  });
});

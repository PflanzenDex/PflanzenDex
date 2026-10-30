import { beforeEach, describe, expect, it } from "vitest";
import { execute, type Operation } from "../../kernel";
import { InMemoryIdempotencyStore } from "../../kernel/test-helpers";
import { InMemoryReview } from "../test-helpers";
import {
  catalogCorrect,
  catalogCorrectionAccept,
  catalogCorrectionReject,
  catalogCorrectionVote,
  catalogCorrectionWithdraw,
  catalogCorrections,
  speciesCorrections,
  catalogFieldHistory,
  catalogFieldRevert,
  myCorrections,
} from "./index";
import type {
  Correction,
  CorrectionEntry,
  CorrectionField,
  CorrectionStore,
  FieldVersion,
  OpenCorrection,
  Vote,
  VoteOutcome,
} from "./types";

const SPECIES = "6f1c2f0e-4b8a-4c52-9d51-0a3f6f2c7e11";

/** Test adapter with the semantics of the database functions: accept/revert write a new version, never delete. */
class FakeStore implements CorrectionStore {
  value: string | null = "Alt";
  version = 1;
  rows: Correction[] = [];
  creators = new Map<string, string>();
  versions: (FieldVersion & { field: CorrectionField })[] = [
    {
      field: "germanName",
      version: 1,
      value: "Alt",
      origin: "source",
      source: {
        name: "gbif",
        link: "https://example.org",
        license: "CC0-1.0",
        retrievedOn: "2026-10-01",
      },
      citation: null,
      disputed: false,
      setAt: "2026-10-01T00:00:00Z",
      setBy: null,
    },
  ];
  async speciesValue(_u: string, id: string) {
    return id === SPECIES ? { latinName: "Aloe vera", value: this.value } : null;
  }
  async create(userId: string, v: Parameters<CorrectionStore["create"]>[1]) {
    const dup = this.rows.find(
      (r) => r.status === "open" && r.field === v.field && r.proposedValue === v.proposedValue,
    );
    if (dup) return { duplicate: dup.id };
    const row: Correction = {
      id: `00000000-0000-4000-8000-${String(this.rows.length).padStart(12, "0")}`,
      speciesId: v.speciesId,
      latinName: "Aloe vera",
      field: v.field,
      oldValue: this.value,
      proposedValue: v.proposedValue,
      reason: v.reason,
      source: v.source,
      status: "open",
      createdAt: "2026-10-02T00:00:00Z",
      decidedAt: null,
      decisionReason: null,
    };
    this.rows.push(row);
    this.creators.set(row.id, userId);
    return row;
  }
  votes = new Map<string, Vote>(); // `${user}|${correction}`
  voteCalls = 0;
  private counts(id: string) {
    const v = [...this.votes].filter(([k]) => k.endsWith(`|${id}`)).map(([, x]) => x);
    return {
      confirmations: v.filter((x) => x === "confirm").length,
      disputes: v.filter((x) => x === "dispute").length,
    };
  }
  async vote(userId: string, id: string, vote: Vote | null): Promise<VoteOutcome> {
    const row = this.rows[this.find(id)];
    if (!row) return "not_found";
    if (row.status !== "open") return "decided";
    if (this.creators.get(id) === userId) return "own";
    if (this.voteCalls >= 3) return "rate_limited";
    this.voteCalls += 1;
    if (vote === null) this.votes.delete(`${userId}|${id}`);
    else this.votes.set(`${userId}|${id}`, vote);
    return "voted";
  }
  async listForSpecies(userId: string, id: string): Promise<OpenCorrection[] | null> {
    if (id !== SPECIES) return null;
    return this.rows
      .filter((r) => r.status === "open")
      .map((r) => ({
        id: r.id,
        field: r.field,
        proposedValue: r.proposedValue,
        reason: r.reason,
        source: r.source,
        createdAt: r.createdAt,
        ...this.counts(r.id),
        myVote: this.votes.get(`${userId}|${r.id}`) ?? null,
        mine: this.creators.get(r.id) === userId,
      }));
  }
  async listOpen(): Promise<CorrectionEntry[]> {
    return this.rows
      .filter((r) => r.status === "open")
      .map((r) => ({ ...r, currentValue: this.value, ...this.counts(r.id) }));
  }
  async listMine(userId: string) {
    return this.rows.filter((r) => this.creators.get(r.id) === userId);
  }
  private find(id: string) {
    return this.rows.findIndex((r) => r.id === id);
  }
  async accept(userId: string, id: string) {
    const i = this.find(id);
    const row = this.rows[i];
    if (!row) return "not_found" as const;
    if (row.status !== "open") return "decided" as const;
    if (row.proposedValue === null) return "no_value" as const;
    this.value = row.proposedValue;
    this.version += 1;
    this.rows[i] = { ...row, status: "accepted", decidedAt: "2026-10-03T00:00:00Z" };
    this.versions.unshift({
      field: row.field,
      version: this.version,
      value: row.proposedValue,
      origin: "community",
      source: null,
      citation: row.source ?? row.reason,
      disputed: false,
      setAt: "2026-10-03T00:00:00Z",
      setBy: userId,
    });
    return { version: this.version };
  }
  async withdraw(userId: string, id: string) {
    const i = this.find(id);
    const row = this.rows[i];
    if (!row || this.creators.get(id) !== userId) return "not_found" as const;
    if (row.status !== "open") return "decided" as const;
    this.rows[i] = { ...row, status: "withdrawn", decidedAt: "2026-10-03T00:00:00Z" };
    return "withdrawn" as const;
  }
  async reject(_u: string, id: string, reason: string) {
    const i = this.find(id);
    const row = this.rows[i];
    if (!row) return "not_found" as const;
    if (row.status !== "open") return "decided" as const;
    this.rows[i] = {
      ...row,
      status: "rejected",
      decidedAt: "2026-10-03T00:00:00Z",
      decisionReason: reason,
    };
    return "rejected" as const;
  }
  async history(_u: string, id: string, field: CorrectionField) {
    return id === SPECIES ? this.versions.filter((v) => v.field === field) : null;
  }
  async revert(userId: string, _id: string, field: CorrectionField, version: number) {
    const old = this.versions.find((v) => v.field === field && v.version === version);
    if (!old) return "not_found" as const;
    if (old.value === this.value) return "unchanged" as const;
    this.value = old.value;
    this.version += 1;
    this.versions.unshift({ ...old, version: this.version, origin: "reviewer", setBy: userId });
    return { version: this.version };
  }
}

let idem: InMemoryIdempotencyStore;
let store: FakeStore;
let review: InMemoryReview;
let n = 0;
const call = <E, A>(op: Operation<E, A>, userId: string | null, input: unknown) =>
  execute(op, { idempotency: idem }, { context: { userId }, input, idempotencyKey: `k${++n}` });
const propose = (user = "keeper", extra: object = {}) =>
  call(catalogCorrect(store), user, {
    speciesId: SPECIES,
    field: "germanName",
    value: "Neu",
    reason: "Steht so im Buch",
    ...extra,
  });

beforeEach(() => {
  idem = new InMemoryIdempotencyStore();
  store = new FakeStore();
  review = new InMemoryReview({ operator: ["operator"], reviewer: ["reviewer"] });
});

describe("US-BES-16 a keeper proposes, the catalog stays unchanged", () => {
  it("stores an open correction with the old value and changes nothing in the catalog (FR-BES-02)", async () => {
    const r = await propose();
    expect(r.ok && r.value).toMatchObject({
      status: "open",
      oldValue: "Alt",
      proposedValue: "Neu",
    });
    expect(store.value).toBe("Alt");
    expect(store.version).toBe(1);
  });

  it("refuses a value of the wrong length and names the field (P-03)", async () => {
    const r = await propose("keeper", { field: "familyLatin", value: "x".repeat(121) });
    expect(!r.ok && r.error.details).toEqual([{ field: "value", code: "input.invalid" }]);
    expect(store.rows).toHaveLength(0);
  });

  it.each([{ reason: "" }, { field: "wateringHint" }, { value: "" }])(
    "refuses invalid input %j",
    async (extra) => {
      const r = await propose("keeper", extra);
      expect(!r.ok && r.error.code).toBe("input.invalid");
      expect(store.rows).toHaveLength(0);
    },
  );

  it("answers an unknown or invisible species like a missing one (P-04)", async () => {
    const r = await propose("keeper", { speciesId: "6f1c2f0e-4b8a-4c52-9d51-0a3f6f2c7e99" });
    expect(!r.ok && r.error.code).toBe("species.not_found");
  });

  it("refuses the value the catalog already holds", async () => {
    const r = await propose("keeper", { value: "Alt" });
    expect(!r.ok && r.error.code).toBe("correction.no_change");
  });

  it("points to the open correction with the same value instead of duplicating it", async () => {
    const first = await propose("anna");
    const second = await propose("bert");
    expect(!second.ok && second.error.code).toBe("correction.duplicate_open");
    expect(!second.ok && second.error.data).toEqual({ id: store.rows[0]?.id });
    expect(first.ok).toBe(true);
    expect(store.rows).toHaveLength(1);
  });

  it("needs sign-in", async () => {
    const r = await propose(null as unknown as string);
    expect(!r.ok && r.error.code).toBe("access.not_signed_in");
  });
});

describe("US-BES-16 accept, reject, revert are for reviewers only", () => {
  it.each(["keeper", "ai-connection"])("%s can neither accept, reject nor revert", async (user) => {
    const c = await propose();
    const id = c.ok ? c.value.id : "";
    const acc = await call(catalogCorrectionAccept(store, review), user, { id });
    const rej = await call(catalogCorrectionReject(store, review), user, { id, reason: "nein" });
    const rev = await call(catalogFieldRevert(store, review), user, {
      speciesId: SPECIES,
      field: "germanName",
      version: 1,
    });
    for (const r of [acc, rej, rev]) expect(!r.ok && r.error.code).toBe("access.denied");
    expect(store.value).toBe("Alt");
    expect(store.rows[0]?.status).toBe("open");
  });

  it("accepting sets the value, raises the catalog version and records community and the reviewer (FR-BES-12)", async () => {
    const c = await propose("anna", { source: "Buch S. 4" });
    const id = c.ok ? c.value.id : "";
    const r = await call(catalogCorrectionAccept(store, review), "reviewer", { id });
    expect(r.ok && r.value).toEqual({ id, status: "accepted", version: 2 });
    expect(store.value).toBe("Neu");
    expect(store.versions[0]).toMatchObject({
      origin: "community",
      citation: "Buch S. 4",
      setBy: "reviewer",
    });
    expect(store.versions).toHaveLength(2);
  });

  it("a correction is decided once (P-10)", async () => {
    const c = await propose();
    const id = c.ok ? c.value.id : "";
    await call(catalogCorrectionAccept(store, review), "reviewer", { id });
    const again = await call(catalogCorrectionReject(store, review), "operator", {
      id,
      reason: "doch nicht",
    });
    expect(!again.ok && again.error.code).toBe("correction.decided");
    const gone = await call(catalogCorrectionAccept(store, review), "reviewer", { id: SPECIES });
    expect(!gone.ok && gone.error.code).toBe("correction.not_found");
  });

  it("rejecting needs a reason, which the creator sees; the catalog stays unchanged", async () => {
    const c = await propose("anna");
    const id = c.ok ? c.value.id : "";
    const without = await call(catalogCorrectionReject(store, review), "reviewer", { id });
    expect(!without.ok && without.error.code).toBe("review.reason_missing");
    const r = await call(catalogCorrectionReject(store, review), "reviewer", {
      id,
      reason: "Quelle passt nicht",
    });
    expect(r.ok && r.value.status).toBe("rejected");
    expect(store.value).toBe("Alt");
    const mine = await myCorrections(store, "anna");
    expect(mine.ok && mine.value[0]).toMatchObject({
      status: "rejected",
      decisionReason: "Quelle passt nicht",
    });
  });

  it("reverting brings the earlier value back as a new version and deletes nothing (P-10)", async () => {
    const c = await propose();
    await call(catalogCorrectionAccept(store, review), "reviewer", { id: c.ok ? c.value.id : "" });
    const r = await call(catalogFieldRevert(store, review), "reviewer", {
      speciesId: SPECIES,
      field: "germanName",
      version: 1,
    });
    expect(r.ok && r.value.version).toBe(3);
    expect(store.value).toBe("Alt");
    expect(store.versions.map((v) => v.version)).toEqual([3, 2, 1]);
    expect(store.versions[0]).toMatchObject({ origin: "reviewer", source: { name: "gbif" } });
    const same = await call(catalogFieldRevert(store, review), "reviewer", {
      speciesId: SPECIES,
      field: "germanName",
      version: 1,
    });
    expect(!same.ok && same.error.code).toBe("correction.unchanged");
    const none = await call(catalogFieldRevert(store, review), "reviewer", {
      speciesId: SPECIES,
      field: "germanName",
      version: 9,
    });
    expect(!none.ok && none.error.code).toBe("correction.version_not_found");
  });
});

describe("US-BES-16 review list and history", () => {
  it("the review list shows open corrections with old, proposed and current value; keepers do not get it", async () => {
    await propose();
    const r = await catalogCorrections(store, review, "reviewer");
    expect(r.ok && r.value.open).toBe(1);
    expect(r.ok && r.value.entries[0]).toMatchObject({
      oldValue: "Alt",
      proposedValue: "Neu",
      currentValue: "Alt",
      reason: "Steht so im Buch",
    });
    const denied = await catalogCorrections(store, review, "keeper");
    expect(!denied.ok && denied.error.code).toBe("access.denied");
  });

  it("the history lists every version; the account that set a value is shown to reviewers only (P-05)", async () => {
    const c = await propose();
    await call(catalogCorrectionAccept(store, review), "reviewer", { id: c.ok ? c.value.id : "" });
    const asKeeper = await catalogFieldHistory(store, review, "keeper", {
      speciesId: SPECIES,
      field: "germanName",
    });
    expect(asKeeper.ok && asKeeper.value.map((v) => [v.version, v.origin, v.setBy])).toEqual([
      [2, "community", null],
      [1, "source", null],
    ]);
    const asReviewer = await catalogFieldHistory(store, review, "reviewer", {
      speciesId: SPECIES,
      field: "germanName",
    });
    expect(asReviewer.ok && asReviewer.value[0]?.setBy).toBe("reviewer");
  });

  it("an invisible species or a field outside the three answers like a missing one", async () => {
    const none = await catalogFieldHistory(store, review, "keeper", {
      speciesId: "6f1c2f0e-4b8a-4c52-9d51-0a3f6f2c7e99",
      field: "germanName",
    });
    expect(!none.ok && none.error.code).toBe("species.not_found");
    const bad = await catalogFieldHistory(store, review, "keeper", {
      speciesId: SPECIES,
      field: "wateringHint",
    });
    expect(!bad.ok && bad.error.code).toBe("input.invalid");
  });
});

describe("US-BES-15 confirm or dispute an open correction (a signal, E-26)", () => {
  const vote = (user: string | null, id: string, v: string) =>
    call(catalogCorrectionVote(store), user, { id, vote: v });
  const open = async () => {
    const c = await propose("keeper");
    if (!c.ok) throw new Error("propose failed");
    return c.value.id;
  };

  it("stores one vote per account and correction; choosing again changes it and none withdraws it", async () => {
    const id = await open();
    expect((await vote("bert", id, "confirm")).ok).toBe(true);
    expect((await vote("bert", id, "dispute")).ok).toBe(true);
    const mine = await speciesCorrections(store, "bert", SPECIES);
    expect(mine.ok && mine.value[0]).toMatchObject({
      confirmations: 0,
      disputes: 1,
      myVote: "dispute",
    });
    await vote("bert", id, "none");
    const after = await speciesCorrections(store, "bert", SPECIES);
    expect(after.ok && after.value[0]).toMatchObject({
      confirmations: 0,
      disputes: 0,
      myVote: null,
    });
  });

  it("shows counts to everybody and never who voted or who proposed", async () => {
    const id = await open();
    await vote("bert", id, "confirm");
    await vote("cleo", id, "confirm");
    const r = await speciesCorrections(store, "dora", SPECIES);
    expect(r.ok && r.value[0]).toMatchObject({
      confirmations: 2,
      disputes: 0,
      myVote: null,
      mine: false,
    });
    expect(JSON.stringify(r)).not.toMatch(/bert|cleo|keeper/);
  });

  it("changes nothing in the catalog by itself, however many confirm (E-26, FR-BES-19)", async () => {
    const id = await open();
    for (const u of ["a", "b"]) await vote(u, id, "confirm");
    expect(store.value).toBe("Alt");
    expect(store.version).toBe(1);
    expect(store.rows[0]?.status).toBe("open");
  });

  it("orders the review list by confirmations first and carries the counts", async () => {
    const first = await open();
    const second = (await propose("keeper2", { value: "Neuer" })) as {
      ok: true;
      value: { id: string };
    };
    await vote("bert", second.value.id, "confirm");
    await vote("bert", first, "dispute");
    const list = await catalogCorrections(store, review, "reviewer");
    expect(list.ok && list.value.entries.map((e) => [e.id, e.confirmations, e.disputes])).toEqual([
      [second.value.id, 1, 0],
      [first, 0, 1],
    ]);
  });

  it("refuses the own proposal, a decided one, an unknown one and a bad choice", async () => {
    const id = await open();
    expect(await vote("keeper", id, "confirm")).toMatchObject({
      ok: false,
      error: { code: "correction.own_vote" },
    });
    expect(await vote("bert", "00000000-0000-4000-8000-0000000000ff", "confirm")).toMatchObject({
      ok: false,
      error: { code: "correction.not_found" },
    });
    expect(await vote("bert", id, "maybe")).toMatchObject({
      ok: false,
      error: { code: "input.invalid" },
    });
    await call(catalogCorrectionReject(store, review), "reviewer", { id, reason: "Nein" });
    expect(await vote("bert", id, "confirm")).toMatchObject({
      ok: false,
      error: { code: "correction.decided" },
    });
  });

  it("refuses too many votes in a short time with a hint to try later", async () => {
    const ids = [await open()];
    for (const v of ["B", "C", "D"]) {
      const c = (await propose("keeper2", { value: v })) as { ok: true; value: { id: string } };
      ids.push(c.value.id);
    }
    for (const id of ids.slice(0, 3)) await vote("bert", id, "confirm");
    expect(await vote("bert", ids[3] ?? "", "confirm")).toMatchObject({
      ok: false,
      error: { code: "correction.vote_rate_limited" },
    });
  });

  it("needs sign-in; an unknown species answers like a missing one", async () => {
    const id = await open();
    expect(await vote(null, id, "confirm")).toMatchObject({
      ok: false,
      error: { code: "access.not_signed_in" },
    });
    expect(await speciesCorrections(store, null, SPECIES)).toMatchObject({ ok: false });
    expect(
      await speciesCorrections(store, "bert", "00000000-0000-4000-8000-0000000000aa"),
    ).toMatchObject({
      ok: false,
      error: { code: "species.not_found" },
    });
  });
});

describe("US-BES-14 withdraw a correction and report a wrong value without a proposal", () => {
  const withdraw = (user: string | null, id: string) =>
    call(catalogCorrectionWithdraw(store), user, { id });
  const created = async (extra: object = {}) => {
    const r = await propose("keeper", extra);
    if (!r.ok) throw new Error("propose failed");
    return r.value.id;
  };

  it("the creator withdraws an open correction; it stays in the list of their own with status withdrawn (P-10)", async () => {
    const id = await created();
    expect((await withdraw("keeper", id)).ok).toBe(true);
    const mine = await myCorrections(store, "keeper");
    expect(mine.ok && mine.value[0]).toMatchObject({ id, status: "withdrawn" });
    expect(store.value).toBe("Alt");
    expect(await withdraw("keeper", id)).toMatchObject({
      ok: false,
      error: { code: "correction.decided" },
    });
  });

  it("somebody else's correction answers like a missing one; it needs sign-in", async () => {
    const id = await created();
    expect(await withdraw("bert", id)).toMatchObject({
      ok: false,
      error: { code: "correction.not_found" },
    });
    expect(await withdraw(null, id)).toMatchObject({
      ok: false,
      error: { code: "access.not_signed_in" },
    });
    expect(store.rows[0]?.status).toBe("open");
  });

  it("reports a field as wrong without a value or a source; it stays open and changes nothing", async () => {
    const r = await call(catalogCorrect(store), "keeper", {
      speciesId: SPECIES,
      field: "germanName",
      reason: "Heißt in Wirklichkeit anders",
    });
    expect(r).toMatchObject({ ok: true, value: { status: "open", proposedValue: null } });
    expect(store.value).toBe("Alt");
  });

  it("a report cannot be accepted, only rejected with a reason", async () => {
    const r = await call(catalogCorrect(store), "keeper", {
      speciesId: SPECIES,
      field: "germanName",
      reason: "Falsch",
    });
    const id = r.ok ? r.value.id : "";
    expect(await call(catalogCorrectionAccept(store, review), "reviewer", { id })).toMatchObject({
      ok: false,
      error: { code: "correction.no_value" },
    });
    expect(
      (
        await call(catalogCorrectionReject(store, review), "reviewer", {
          id,
          reason: "Quelle fehlt",
        })
      ).ok,
    ).toBe(true);
  });

  it("still refuses a value of the wrong length and a missing reason (P-03)", async () => {
    expect(await propose("keeper", { value: "x".repeat(121) })).toMatchObject({ ok: false });
    expect(await propose("keeper", { reason: "" })).toMatchObject({ ok: false });
  });
});

import { describe, expect, it } from "vitest";
import { appError } from "../kernel/error";
import { execute } from "../kernel/operation";
import { failed, ok, type Result } from "../kernel/result";
import { InMemoryIdempotencyStore } from "../kernel/test-helpers";
import { sessionsNotConfigured, signOutEverywhere, type IdentitySessions } from "./index";

// US-ACC-01 (issue 2065): signing out on all devices ends the keeper's sessions at the sign-in service, through this
// operation and its port. The fake port records the subjects it was asked to end.
class FakeIdentity implements IdentitySessions {
  readonly subjects: string[] = [];
  constructor(public answer: Result<"ended" | "not_configured">) {}
  async endAll(subject: string) {
    this.subjects.push(subject);
    return this.answer;
  }
}

const setup = (identity: IdentitySessions) => {
  const idempotency = new InMemoryIdempotencyStore();
  let n = 0;
  const call = (userId: string | null, input: unknown, key = `k${++n}`) =>
    execute(
      signOutEverywhere({ identity }),
      { idempotency },
      { context: { userId }, input, idempotencyKey: key },
    );
  return { call };
};

describe("US-ACC-01 signing out on all devices ends the sessions of the keeper", () => {
  it("US-ACC-01 ends the sessions of the subject it is given and answers ended", async () => {
    const identity = new FakeIdentity(ok("ended"));
    const { call } = setup(identity);
    expect(await call("acc-1", { subject: "sub-1" })).toEqual({ ok: true, value: { ended: true } });
    expect(identity.subjects).toEqual(["sub-1"]);
  });

  it("US-ACC-01 without a configured sign-in service it answers unavailable and ends nothing", async () => {
    const r = await setup(sessionsNotConfigured).call("acc-1", { subject: "sub-1" });
    expect(r.ok ? null : r.error.code).toBe("account.sign_out_everywhere_unavailable");
    expect(r.ok).toBe(false);
  });

  it("US-ACC-01 a configured service that does not end the sessions answers unavailable, never ended", async () => {
    const identity = new FakeIdentity(ok("not_configured"));
    const r = await setup(identity).call("acc-1", { subject: "sub-1" });
    expect(r.ok ? null : r.error.code).toBe("account.sign_out_everywhere_unavailable");
  });

  it("US-ACC-01 a failing sign-in service is an error, and nothing counts as ended (P-10)", async () => {
    const identity = new FakeIdentity(failed(appError("account.sign_out_everywhere_failed")));
    const r = await setup(identity).call("acc-1", { subject: "sub-1" });
    expect(r.ok ? null : r.error.code).toBe("account.sign_out_everywhere_failed");
    expect(r.ok).toBe(false);
  });

  it("US-ACC-01 a failed attempt can be repeated with the same key and then ends the sessions", async () => {
    const identity = new FakeIdentity(failed(appError("account.sign_out_everywhere_failed")));
    const { call } = setup(identity);
    expect((await call("acc-1", { subject: "sub-1" }, "same")).ok).toBe(false);
    identity.answer = ok("ended");
    expect(await call("acc-1", { subject: "sub-1" }, "same")).toEqual({
      ok: true,
      value: { ended: true },
    });
    expect(identity.subjects).toHaveLength(2);
  });

  it("US-ACC-01 the same Idempotency-Key ends the sessions once and repeats the answer", async () => {
    const identity = new FakeIdentity(ok("ended"));
    const { call } = setup(identity);
    const first = await call("acc-1", { subject: "sub-1" }, "same");
    const second = await call("acc-1", { subject: "sub-1" }, "same");
    expect(second).toEqual(first);
    expect(identity.subjects).toEqual(["sub-1"]);
  });

  it("US-ACC-01 a subject is required: invalid input ends nothing", async () => {
    const identity = new FakeIdentity(ok("ended"));
    const { call } = setup(identity);
    for (const bad of [{}, { subject: "" }, { subject: "   " }, { subject: 7 }, null]) {
      const r = await call("acc-1", bad);
      expect(r.ok ? null : r.error.code).toBe("input.invalid");
    }
    expect(identity.subjects).toEqual([]);
  });

  it("US-ACC-01 signing out on all devices needs a signed-in keeper and ends nothing without one", async () => {
    const identity = new FakeIdentity(ok("ended"));
    const r = await setup(identity).call(null, { subject: "sub-1" });
    expect(r.ok ? null : r.error.code).toBe("access.not_signed_in");
    expect(identity.subjects).toEqual([]);
  });
});

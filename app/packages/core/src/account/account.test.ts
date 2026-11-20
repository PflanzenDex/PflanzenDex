import { describe, expect, it } from "vitest";
import { appError } from "../kernel/error";
import { execute } from "../kernel/operation";
import { failed, ok, type Result } from "../kernel/result";
import { InMemoryIdempotencyStore } from "../kernel/test-helpers";
import {
  accountFromClaims,
  mayShareWithFriends,
  sessionsNotConfigured,
  signOutEverywhere,
  type IdentitySessions,
} from "./index";

describe("account data from the claims of the sign-in service (US-ACC-01)", () => {
  it("takes subject, email, display name and confirmation", () => {
    const k = accountFromClaims({
      sub: "abc",
      email: "Lena@Example.test",
      name: "Lena",
      email_verified: true,
    });
    expect(k).toEqual({
      subject: "abc",
      email: "lena@example.test",
      displayName: "Lena",
      emailConfirmed: true,
    });
  });

  it("without a confirmation flag the email counts as unconfirmed (safe default)", () => {
    const k = accountFromClaims({ sub: "abc", email: "a@example.test" });
    expect(k?.emailConfirmed).toBe(false);
    expect(k?.displayName).toBeNull();
  });

  it("only the value true confirms, strings do not", () => {
    const k = accountFromClaims({ sub: "a", email: "a@b.test", email_verified: "true" });
    expect(k?.emailConfirmed).toBe(false);
  });

  it("without subject or without email the token is unusable", () => {
    expect(accountFromClaims({ email: "a@b.test" })).toBeNull();
    expect(accountFromClaims({ sub: "a" })).toBeNull();
    expect(accountFromClaims({ sub: "", email: "a@b.test" })).toBeNull();
  });
});

describe("sharing with friends needs a confirmed email address (US-ACC-01)", () => {
  it("confirmed: allowed, unconfirmed: not allowed", () => {
    const base = { subject: "a", email: "a@b.test", displayName: null };
    expect(mayShareWithFriends({ ...base, emailConfirmed: true })).toBe(true);
    expect(mayShareWithFriends({ ...base, emailConfirmed: false })).toBe(false);
  });
});

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

const setupSignOut = (identity: IdentitySessions) => {
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
    const { call } = setupSignOut(identity);
    expect(await call("acc-1", { subject: "sub-1" })).toEqual({ ok: true, value: { ended: true } });
    expect(identity.subjects).toEqual(["sub-1"]);
  });

  it("US-ACC-01 without a configured sign-in service it answers unavailable and ends nothing", async () => {
    const r = await setupSignOut(sessionsNotConfigured).call("acc-1", { subject: "sub-1" });
    expect(r.ok).toBe(false);
    expect(r.ok ? null : r.error.code).toBe("account.sign_out_everywhere_unavailable");
  });

  it("US-ACC-01 a configured service that does not end the sessions answers unavailable, never ended", async () => {
    const identity = new FakeIdentity(ok("not_configured"));
    const r = await setupSignOut(identity).call("acc-1", { subject: "sub-1" });
    expect(r.ok ? null : r.error.code).toBe("account.sign_out_everywhere_unavailable");
  });

  it("US-ACC-01 a failing sign-in service is an error, and nothing counts as ended (P-10)", async () => {
    const identity = new FakeIdentity(failed(appError("account.sign_out_everywhere_failed")));
    const r = await setupSignOut(identity).call("acc-1", { subject: "sub-1" });
    expect(r.ok).toBe(false);
    expect(r.ok ? null : r.error.code).toBe("account.sign_out_everywhere_failed");
  });

  it("US-ACC-01 a failed attempt can be repeated with the same key and then ends the sessions", async () => {
    const identity = new FakeIdentity(failed(appError("account.sign_out_everywhere_failed")));
    const { call } = setupSignOut(identity);
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
    const { call } = setupSignOut(identity);
    const first = await call("acc-1", { subject: "sub-1" }, "same");
    const second = await call("acc-1", { subject: "sub-1" }, "same");
    expect(second).toEqual(first);
    expect(identity.subjects).toEqual(["sub-1"]);
  });

  it("US-ACC-01 a subject is required: invalid input ends nothing", async () => {
    const identity = new FakeIdentity(ok("ended"));
    const { call } = setupSignOut(identity);
    for (const bad of [{}, { subject: "" }, { subject: "   " }, { subject: 7 }, null]) {
      const r = await call("acc-1", bad);
      expect(r.ok ? null : r.error.code).toBe("input.invalid");
    }
    expect(identity.subjects).toEqual([]);
  });

  it("US-ACC-01 signing out on all devices needs a signed-in keeper and ends nothing without one", async () => {
    const identity = new FakeIdentity(ok("ended"));
    const r = await setupSignOut(identity).call(null, { subject: "sub-1" });
    expect(r.ok ? null : r.error.code).toBe("access.not_signed_in");
    expect(identity.subjects).toEqual([]);
  });
});

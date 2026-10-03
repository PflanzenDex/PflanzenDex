import { describe, expect, it } from "vitest";
import { mayShareWithFriends, accountFromClaims } from "./index";

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

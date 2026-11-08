import { describe, expect, it } from "vitest";
import { InMemoryObjectStore } from "../media";
import type { JobRow } from "../jobs";
import { appError, failed, ok } from "../kernel";
import { deleteAccountJob, identityKept, type AccountEraser, type IdentityRemoval } from "./index";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-10-23T10:00:00Z");
const job = { payload: { accountId: ACCOUNT } } as unknown as JobRow;

function setup(
  opts: { dueAt?: Date | null; identity?: IdentityRemoval; subject?: string | null } = {},
) {
  const photos = new InMemoryObjectStore();
  const log: string[] = [];
  let dueAt = opts.dueAt === undefined ? new Date("2026-10-23T09:00:00Z") : opts.dueAt;
  const subject = opts.subject === undefined ? "sub-1" : opts.subject;
  const eraser: AccountEraser = {
    subjectOf: async () => subject,
    erase: async () => {
      log.push("erase");
      dueAt = null; // the request goes with the account
      return { subject };
    },
    identityRemoved: async (s) => void log.push(`marked ${s}`),
  };
  const identity: IdentityRemoval = {
    remove: async (s) => {
      log.push(`identity ${s}`);
      return (opts.identity ?? identityKept).remove(s);
    },
  };
  const handler = deleteAccountJob({
    deletions: { find: async () => (dueAt ? { requestedAt: new Date(0), dueAt } : null) },
    eraser,
    photos,
    identity,
  });
  return { photos, log, run: () => handler(job, NOW) };
}

describe("US-ACC-04 the job removes the account when it is due", () => {
  it("US-ACC-04 removes the photos by prefix, then the account, and leaves the identity pending in the stub", async () => {
    const { photos, log, run } = setup();
    await photos.put(ACCOUNT, "p1.webp", new Uint8Array([1]), "image/webp");
    await photos.put(ACCOUNT, "orphan.webp", new Uint8Array([2]), "image/webp");
    await run();
    expect(photos.objectCount()).toBe(0);
    expect(log).toEqual(["identity sub-1", "erase"]);
  });

  it("US-ACC-04 removes the identity before the data, and marks it removed afterwards", async () => {
    const { log, run } = setup({
      identity: { remove: async () => ok("removed") },
    });
    await run();
    expect(log).toEqual(["identity sub-1", "erase", "marked sub-1"]);
  });

  it("US-ACC-04 an account without a sign-in subject has no identity step", async () => {
    const { log, run } = setup({ subject: null });
    await run();
    expect(log).toEqual(["erase"]);
  });

  it("US-ACC-04 does nothing for a withdrawn request, a request not yet due and an account already gone", async () => {
    for (const dueAt of [null, new Date("2026-10-24T00:00:00Z")]) {
      const { photos, log, run } = setup({ dueAt });
      await photos.put(ACCOUNT, "p1.webp", new Uint8Array([1]), "image/webp");
      await run();
      expect(log).toEqual([]);
      expect(photos.objectCount()).toBe(1);
    }
  });

  it("US-ACC-04 running twice is harmless: the second run finds nothing to erase", async () => {
    const { run, log } = setup();
    await run();
    await run();
    expect(log).toEqual(["identity sub-1", "erase"]);
  });

  it("US-ACC-04 a failing object store stops the job before any data is gone, so it can retry (P-10)", async () => {
    const { photos, log, run } = setup();
    photos.deleteAll = async () => failed(appError("media.storage_unavailable"));
    await expect(run()).rejects.toThrow("media.storage_unavailable");
    expect(log).toEqual([]);
  });

  it("US-ACC-04 an identity service that fails stops the job before the erase, so the retry still finds the request (P-10)", async () => {
    const { log, run } = setup({
      identity: { remove: async () => failed(appError("privacy.identity_removal_failed")) },
    });
    await expect(run()).rejects.toThrow("identity not removed: privacy.identity_removal_failed");
    expect(log).toEqual(["identity sub-1"]);
  });
});

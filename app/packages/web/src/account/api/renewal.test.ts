// @vitest-environment jsdom
// US-ACC-01 (issue 2274): the access token is renewed once per device, however many tabs or installed apps of this origin
// hold the sign-in. The sign-in library runs for real (oidc-client-ts). The token endpoint rotates the refresh token as the
// realm does (revokeRefreshToken, refreshTokenMaxReuse 0): each refresh token is accepted once, a reused one is refused
// with invalid_grant.
import { InMemoryWebStorage, User, UserManager, WebStorageStateStore } from "oidc-client-ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { oidcSettings } from "./account-api";
import { shareSilentSignin } from "./renewal";
import { newManager } from "./sign-in-client";

const AUTHORITY = "https://auth.example.test/realms/pflanzendex";
const CLIENT_ID = "pflanzendex-web";
const LIFETIME = 300; // seconds a renewed access token lives
const DUE = 30; // seconds left on the seeded token: below the library's 60 s window, so the renewal is due

type Realm = { calls: number; live: Set<string>; issued: number };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// A token endpoint that rotates like the realm: each refresh token is accepted once. A refusal comes back after a network
// delay, so a renewal that stored its user meanwhile is visible to the refused tab, as on a real network.
function rotatingRealm(authority = AUTHORITY): Realm {
  const tokenUrl = `${authority}/protocol/openid-connect/token`;
  const realm: Realm = { calls: 0, live: new Set(["r0"]), issued: 0 };
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === `${authority}/.well-known/openid-configuration`)
      return json(200, {
        issuer: authority,
        token_endpoint: tokenUrl,
        authorization_endpoint: `${authority}/protocol/openid-connect/auth`,
      });
    if (url !== tokenUrl) throw new Error(`unexpected request to ${url}`);
    realm.calls += 1;
    const presented = new URLSearchParams(String(init?.body)).get("refresh_token") ?? "";
    if (!realm.live.delete(presented)) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return json(400, { error: "invalid_grant" });
    }
    realm.issued += 1;
    realm.live.add(`r${realm.issued}`);
    return json(200, {
      access_token: `a${realm.issued}`,
      refresh_token: `r${realm.issued}`,
      token_type: "Bearer",
      expires_in: LIFETIME,
      scope: "openid profile email",
    });
  });
  return realm;
}

// Web Locks as the browser grants them: one queue per lock name, in request order, released when the callback settles.
function webLocks() {
  const queues = new Map<string, Promise<unknown>>();
  return {
    request: (name: string, callback: () => unknown) => {
      const run = (queues.get(name) ?? Promise.resolve()).then(
        () => callback(),
        () => callback(),
      );
      queues.set(
        name,
        run.catch(() => undefined),
      );
      return run;
    },
  };
}

function withWebLocks(): void {
  Object.defineProperty(navigator, "locks", { value: webLocks(), configurable: true });
}

const tabs: UserManager[] = [];

// A sign-in manager as the app holds one, on the storage the other tabs share. Metadata is given, so no discovery request.
function tab(store: InMemoryWebStorage): UserManager {
  const mgr = new UserManager({
    authority: AUTHORITY,
    client_id: CLIENT_ID,
    redirect_uri: "https://app.example.test/",
    response_type: "code",
    scope: "openid profile email",
    metadata: { issuer: AUTHORITY, token_endpoint: `${AUTHORITY}/protocol/openid-connect/token` },
    userStore: new WebStorageStateStore({ store }),
  });
  mgr.signinSilent = shareSilentSignin(mgr);
  tabs.push(mgr);
  return mgr;
}

// The user a tab keeps for this sign-in: the refresh token r0 and an access token with `secondsLeft` seconds left.
async function seed(mgr: UserManager, secondsLeft: number): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await mgr.storeUser(
    new User({
      access_token: "a0",
      refresh_token: "r0",
      token_type: "Bearer",
      scope: "openid profile email",
      profile: { iss: AUTHORITY, sub: "keeper", aud: CLIENT_ID, exp: now + secondsLeft, iat: now },
      expires_at: now + secondsLeft,
    }),
  );
}

afterEach(async () => {
  await Promise.all(tabs.splice(0).map((mgr) => mgr.removeUser())); // also stops the timers the managers started
  vi.unstubAllGlobals();
  delete (navigator as unknown as { locks?: unknown }).locks;
  window.localStorage.clear();
});

describe("US-ACC-01 a second tab's renewal does not end the session (issue 2274)", () => {
  it("US-ACC-01 a second tab renewing with an already rotated refresh token keeps the session (issue 2274)", async () => {
    // jsdom has no Web Locks: both renewals reach the token endpoint, and the second one is refused.
    expect("locks" in navigator).toBe(false);
    const store = new InMemoryWebStorage();
    const realm = rotatingRealm();
    const first = tab(store);
    const second = tab(store);
    await seed(first, DUE);
    const [a, b] = await Promise.all([first.signinSilent(), second.signinSilent()]);
    expect(a?.access_token).toBe("a1");
    expect(b?.access_token).toBe("a1");
    expect((await first.getUser())?.refresh_token).toBe("r1");
    expect(realm.calls).toBe(2);
  });

  it("US-ACC-01 with Web Locks the renewal runs once across tabs, and both tabs get the new token (issue 2274)", async () => {
    withWebLocks();
    const store = new InMemoryWebStorage();
    const realm = rotatingRealm();
    const first = tab(store);
    const second = tab(store);
    await seed(first, DUE);
    const [a, b] = await Promise.all([first.signinSilent(), second.signinSilent()]);
    expect(realm.calls).toBe(1);
    expect(a?.access_token).toBe("a1");
    expect(b?.access_token).toBe("a1");
  });

  it("US-ACC-01 a tab whose renewal comes after another tab's makes no request of its own (issue 2274)", async () => {
    // A background tab's timers run late: by then the other tab has renewed, and the stored token is not due any more.
    const store = new InMemoryWebStorage();
    const realm = rotatingRealm();
    const first = tab(store);
    const second = tab(store);
    await seed(first, DUE);
    await first.signinSilent();
    const late = await second.signinSilent();
    expect(realm.calls).toBe(1);
    expect(late?.access_token).toBe("a1");
  });

  it("US-ACC-01 a real end stays an end: a refused renewal with the stored token unchanged still rejects (P-10, issue 2274)", async () => {
    const store = new InMemoryWebStorage();
    const realm = rotatingRealm();
    realm.live.clear(); // the realm no longer knows the stored refresh token: nobody renewed it
    const mgr = tab(store);
    await seed(mgr, DUE);
    await expect(mgr.signinSilent()).rejects.toMatchObject({ error: "invalid_grant" });
    expect(realm.calls).toBe(1);
  });
});

describe("US-ACC-01 the app's sign-in managers share the renewal (issue 2274)", () => {
  it("US-ACC-01 two sign-in managers of the app renewing at once make one token request under Web Locks (issue 2274)", async () => {
    withWebLocks();
    const authority = String(
      oidcSettings(import.meta.env as Record<string, string | undefined>, window.location.origin)
        .authority,
    );
    const realm = rotatingRealm(authority);
    const first = await newManager();
    const second = await newManager();
    tabs.push(first, second);
    await seed(first, DUE);
    const [a, b] = await Promise.all([first.signinSilent(), second.signinSilent()]);
    expect(realm.calls).toBe(1);
    expect(a?.access_token).toBe("a1");
    expect(b?.access_token).toBe("a1");
  });
});

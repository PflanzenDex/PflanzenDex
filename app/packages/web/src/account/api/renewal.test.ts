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

type Realm = {
  calls: number;
  live: Set<string>;
  issued: number;
  lastForm: URLSearchParams | null;
  // Runs before a refusal is sent: a test uses it to let another tab store its user meanwhile.
  beforeRefusal?: () => Promise<void>;
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// A token endpoint that rotates like the realm: each refresh token is accepted once. A refusal comes back after a network
// delay, so a renewal that stored its user meanwhile is visible to the refused tab, as on a real network.
function rotatingRealm(authority = AUTHORITY): Realm {
  const tokenUrl = `${authority}/protocol/openid-connect/token`;
  const realm: Realm = { calls: 0, live: new Set(["r0"]), issued: 0, lastForm: null };
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
    realm.lastForm = new URLSearchParams(String(init?.body));
    const presented = realm.lastForm.get("refresh_token") ?? "";
    if (!realm.live.delete(presented)) {
      await realm.beforeRefusal?.();
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

// The renewal without Web Locks is set explicitly, so it keeps its coverage whatever the test environment provides (issue 2274).
function withoutWebLocks(): void {
  Object.defineProperty(navigator, "locks", { value: undefined, configurable: true });
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

// The user a tab keeps for this sign-in: the refresh token r0 and an access token with `secondsLeft` seconds left. `as`
// changes the keeper (the `sub` claim) and the tokens, for a user stored by another keeper.
async function seed(
  mgr: UserManager,
  secondsLeft: number,
  as: { sub?: string; refresh?: string; access?: string } = {},
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await mgr.storeUser(
    new User({
      access_token: as.access ?? "a0",
      refresh_token: as.refresh ?? "r0",
      token_type: "Bearer",
      scope: "openid profile email",
      profile: {
        iss: AUTHORITY,
        sub: as.sub ?? "keeper",
        aud: CLIENT_ID,
        exp: now + secondsLeft,
        iat: now,
      },
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
    withoutWebLocks(); // both renewals reach the token endpoint, and the second one is refused and recovered from the store
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

  it("US-ACC-01 a renewal with arguments takes the lock but always asks the token endpoint (issue 2274)", async () => {
    // The shortcut answers the plain renewal of the timers only: a call with arguments asks for its own token, so the
    // stored one (still fresh here) is not handed back for it.
    withWebLocks();
    const store = new InMemoryWebStorage();
    const realm = rotatingRealm();
    const mgr = tab(store);
    await seed(mgr, LIFETIME);
    const renewed = await mgr.signinSilent({ extraTokenParams: { audience: "pflanzendex-api" } });
    expect(realm.calls).toBe(1);
    expect(realm.lastForm?.get("audience")).toBe("pflanzendex-api");
    expect(renewed?.access_token).toBe("a1");
  });

  it("US-ACC-01 a refused renewal does not take over another keeper's user stored meanwhile (P-10, issue 2274)", async () => {
    // Only the same keeper's renewed token counts as renewed by another tab: a user another keeper signed in with is not
    // the session that ended here, so this tab's session still ends.
    withoutWebLocks();
    const store = new InMemoryWebStorage();
    const realm = rotatingRealm();
    realm.live.clear(); // this keeper's refresh token is refused
    const mgr = tab(store);
    const other = tab(store);
    await seed(mgr, DUE);
    realm.beforeRefusal = () =>
      seed(other, LIFETIME, { sub: "someone-else", refresh: "r9", access: "a9" });
    await expect(mgr.signinSilent()).rejects.toMatchObject({ error: "invalid_grant" });
    expect(realm.calls).toBe(1);
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

  it("US-ACC-01 the library's own automatic renewal of two app managers makes one token request and ends nothing (issue 2274)", async () => {
    // No direct call: the stored token is due, the app loads it (getUser), and the library's expiring timers fire and call
    // signinSilent by name. A library upgrade that stops doing so fails here, not in production.
    withWebLocks();
    const authority = String(
      oidcSettings(import.meta.env as Record<string, string | undefined>, window.location.origin)
        .authority,
    );
    const realm = rotatingRealm(authority);
    const first = await newManager();
    const second = await newManager();
    tabs.push(first, second);
    const ended = vi.fn();
    first.events.addSilentRenewError(ended);
    second.events.addSilentRenewError(ended);
    // Counted after the library's own renewal handler: the events raise their handlers in order, so a count means that
    // tab's renewal has finished.
    const expiring = { first: 0, second: 0 };
    first.events.addAccessTokenExpiring(() => {
      expiring.first += 1;
    });
    second.events.addAccessTokenExpiring(() => {
      expiring.second += 1;
    });
    await seed(first, DUE);
    await first.getUser();
    await second.getUser();
    await vi.waitFor(() => expect(expiring).toEqual({ first: 1, second: 1 }), { timeout: 5000 });
    expect(realm.calls).toBe(1);
    expect(ended).not.toHaveBeenCalled();
  });
});

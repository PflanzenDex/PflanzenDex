// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { beginAppStart } from "@/shared/ui/skeleton.delayed";

// The chunks of the start are held until the test opens them, one stage after the other (issue 2230): the sign-in check, the
// shell's code, the route table and the code of "Heute". The app and its modules run for real. The gates start closed for
// every test (`fresh`): the mocks below await them when their module loads, so a test that loads them again gets new ones.
// `callback` holds the code exchange of a sign-in return (issue 2244).
const gates = vi.hoisted(() => {
  const gate = () => {
    let open!: () => void;
    const promise = new Promise<void>((done) => (open = done));
    return { promise, open };
  };
  const fresh = () => ({
    session: gate(),
    shell: gate(),
    routes: gate(),
    today: gate(),
    callback: gate(),
    friends: gate(),
    discover: gate(),
  });
  return { ...fresh(), fresh };
});
const mgr = vi.hoisted(() => ({ getUser: vi.fn(), signinCallback: vi.fn() }));

vi.mock("oidc-client-ts", () => ({
  WebStorageStateStore: vi.fn(),
  UserManager: class {
    settings = { authority: "http://auth/realm" };
    events = {
      addUserSignedOut: () => undefined,
      removeUserSignedOut: () => undefined,
      addSilentRenewError: () => undefined,
      removeSilentRenewError: () => undefined,
    };
    getUser = mgr.getUser;
    signinCallback = mgr.signinCallback;
    removeUser = vi.fn(async () => undefined);
    signinRedirect = vi.fn(async () => undefined);
    // The sign-in manager of the app wraps this method for the shared renewal (issue 2274, api/renewal.ts).
    signinSilent = vi.fn(async () => undefined);
    signoutRedirect = vi.fn(async () => undefined);
  },
}));
vi.mock("./signed-in-frame/signed-in-frame", async (importOriginal) => {
  await gates.shell.promise;
  return importOriginal<typeof import("./signed-in-frame/signed-in-frame")>();
});
vi.mock("@/app/routes", async (importOriginal) => {
  await gates.routes.promise;
  return importOriginal<typeof import("@/app/routes")>();
});
vi.mock("@/app/destinations/today-area/today-area", async (importOriginal) => {
  await gates.today.promise;
  return importOriginal<typeof import("@/app/destinations/today-area/today-area")>();
});
// The pages of "Freunde" and "Entdecken" load last in their picture (issue 2243): their code is held, the route's skeleton shows.
vi.mock("@/social/pages/friends-page/friends-page", async (importOriginal) => {
  await gates.friends.promise;
  return importOriginal<typeof import("@/social/pages/friends-page/friends-page")>();
});
vi.mock("@/app/destinations/discover-area/discover-area", async (importOriginal) => {
  await gates.discover.promise;
  return importOriginal<typeof import("@/app/destinations/discover-area/discover-area")>();
});

/**
 * Registers the three gated chunks again for a fresh module graph: `vi.resetModules` clears the modules but not the mocks, and
 * a mock keeps the module of its first load, so a test that loads the chunks again needs the gates registered once more.
 */
function holdChunks() {
  vi.doMock("./signed-in-frame/signed-in-frame", async (importOriginal) => {
    await gates.shell.promise;
    return importOriginal<typeof import("./signed-in-frame/signed-in-frame")>();
  });
  vi.doMock("@/app/routes", async (importOriginal) => {
    await gates.routes.promise;
    return importOriginal<typeof import("@/app/routes")>();
  });
  vi.doMock("@/app/destinations/today-area/today-area", async (importOriginal) => {
    await gates.today.promise;
    return importOriginal<typeof import("@/app/destinations/today-area/today-area")>();
  });
}

import { App } from "./app";

const KEY = "oidc.user:http://localhost:18081/realms/pflanzendex:pflanzendex-web";
const ACCOUNT = {
  id: "1",
  email: "lena@example.test",
  displayName: "Lena",
  timeZone: "Europe/Berlin",
  emailConfirmed: true,
  mayShareWithFriends: true,
};

/** The keeper's account answers; every other request fails, so the parts of "Heute" show their own states. */
let accountAsked = false;
function answerApi() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      if (path === "/account") {
        accountAsked = true;
        return new Response(JSON.stringify(ACCOUNT), { status: 200 });
      }
      return new Response(
        JSON.stringify({ error: { code: "server.not_found", text: "Nicht vorhanden." } }),
        {
          status: 404,
        },
      );
    }),
  );
}

/** The bar of the shell (below md): the elements that hold a title in the top bar. */
const barTitles = () =>
  Array.from(document.querySelectorAll("[data-app-bar-slot] h1"), (h) => h.textContent);

/** The page's own body holds the main column: its status carries the page's loading text (issue 2243, not the generic skeleton). */
function expectPageBody(stage: string, label: string) {
  const main = document.querySelector("main") as HTMLElement;
  const statuses = within(main)
    .queryAllByRole("status")
    .map((s) => s.textContent ?? "");
  expect(statuses.join("|"), stage).toContain(label);
}

/** The main column: it holds the skeleton of "Heute" (its status) or the content, never nothing (issue 2230). */
function expectMainHoldsSomething(stage: string) {
  const main = document.querySelector("main");
  expect(main, stage).not.toBeNull();
  const status = within(main as HTMLElement).queryAllByRole("status");
  const holds =
    status.some((s) => s.textContent?.includes("Heute wird geladen")) ||
    (main?.textContent ?? "").trim().length > 0;
  expect(holds, `${stage}: main holds the skeleton or the content`).toBe(true);
}

beforeEach(() => {
  setViewportWidth(360);
  Object.assign(gates, gates.fresh());
  accountAsked = false;
  window.localStorage.setItem(KEY, JSON.stringify({ expires_at: Date.now() / 1000 + 3600 }));
  mgr.getUser.mockImplementation(async () => {
    await gates.session.promise;
    return { access_token: "tok", expired: false };
  });
  answerApi();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("US-QS-32 the start hands over to Freunde and Entdecken in one picture (SG-STATE-02, issue 2243)", () => {
  it.each([
    ["/friends", "Freunde", "Freunde werden geladen"],
    ["/discover", "Entdecken", "Vorschläge werden geladen"],
  ])(
    "US-QS-32 · issue 2243 %s: the start and the route's skeleton hold one title in the bar and the page's body until its code arrives",
    async (path, title, label) => {
      const end = beginAppStart();
      try {
        render(
          <MemoryRouter initialEntries={[path]}>
            <App />
          </MemoryRouter>,
        );

        // 1. The sign-in check is open: the start frame shows the body of the address.
        expect(barTitles()).toEqual([title]);
        expectPageBody("session loading", label);

        // 2. The check answered and the account loads; the shell's code is still on its way.
        gates.session.open();
        await waitFor(() => expect(accountAsked).toBe(true));
        await new Promise((done) => setTimeout(done, 20));
        expect(barTitles()).toEqual([title]);
        expectPageBody("shell code loading", label);

        // 3. The shell is mounted; its route table is still on its way.
        gates.shell.open();
        await screen.findByRole("navigation", { name: "Navigation unten" });
        expect(barTitles()).toEqual([title]);
        expectPageBody("routes loading", label);

        // 4. The routes are in; the page's code is still held, so the route's own skeleton holds the title and the body.
        gates.routes.open();
        await new Promise((done) => setTimeout(done, 50));
        expect(barTitles()).toEqual([title]);
        expectPageBody("route skeleton", label);
      } finally {
        end();
      }
    },
  );
});

describe("US-QS-32 the start hands over to Heute in one picture (SG-STATE-02, issue 2230)", () => {
  it("US-QS-32 · the title and the skeleton of Heute hold through every stage of the start: one title in the bar, never an empty main", async () => {
    // A fresh module graph: an earlier test may have started the idle preload of "Heute", whose mock then still waits on that
    // test's closed gate, and a later import would get that pending module (seen with vitest 5.1).
    vi.resetModules();
    holdChunks();
    const { beginAppStart: startApp } = await import("@/shared/ui/skeleton.delayed");
    const { App: FreshApp } = await import("./app");
    const end = startApp();
    try {
      render(
        <MemoryRouter initialEntries={["/today"]}>
          <FreshApp />
        </MemoryRouter>,
      );

      // 1. The sign-in check is open: the start frame shows the page of "Heute".
      expect(barTitles()).toEqual(["Heute"]);
      expectMainHoldsSomething("session loading");

      // 2. The check answered and the account loads; the shell's code is still on its way.
      gates.session.open();
      await waitFor(() => expect(accountAsked).toBe(true));
      await new Promise((done) => setTimeout(done, 20));
      expect(barTitles()).toEqual(["Heute"]);
      expectMainHoldsSomething("shell code loading");

      // 3. The shell is mounted; its route table is still on its way: the route's fallback holds the title and the body.
      gates.shell.open();
      await screen.findByRole("navigation", { name: "Navigation unten" });
      expect(barTitles()).toEqual(["Heute"]);
      expectMainHoldsSomething("routes loading");

      // 4. The routes are in: "Heute" is the address, its code is still on its way (the route's skeleton of Heute).
      gates.routes.open();
      await new Promise((done) => setTimeout(done, 50));
      expect(barTitles()).toEqual(["Heute"]);
      expectMainHoldsSomething("Heute loading");

      // 5. The code of "Heute" is in: its content replaces the skeleton, the title stays in the bar.
      gates.today.open();
      await waitFor(() =>
        expect(
          within(document.querySelector("main") as HTMLElement)
            .queryAllByRole("status")
            .some((s) => s.textContent?.includes("Heute wird geladen")),
        ).toBe(false),
      );
      expect(barTitles()).toEqual(["Heute"]);
      expectMainHoldsSomething("content");
    } finally {
      end();
    }
  });

  it("US-QS-32 · the sign-in return hands over in one picture: the code exchange, the address put back and the redirect keep main on a skeleton, never empty (issue 2244)", async () => {
    // A fresh module graph, so the chunks load in the order this test opens the gates: `resetModules` keeps the mocks, so the
    // three gated chunks are registered again (`holdChunks`). The return is the real one: the address carries the code and
    // the state, the sign-in library stores the user when the exchange ends, and the router is the app's own (TransitionRouter),
    // which reads the address again after the address is put back (issue 1823).
    vi.resetModules();
    holdChunks();
    const { beginAppStart: startApp } = await import("@/shared/ui/skeleton.delayed");
    const { App: ReturnApp } = await import("./app");
    const { TransitionRouter } =
      await import("@/shared/platform/routing/route-transition/transition-router/transition-router");
    window.localStorage.removeItem(KEY);
    mgr.getUser.mockImplementation(async () =>
      window.localStorage.getItem(KEY) ? { access_token: "tok-return", expired: false } : null,
    );
    mgr.signinCallback.mockImplementation(async () => {
      await gates.callback.promise;
      window.localStorage.setItem(
        KEY,
        JSON.stringify({ expires_at: Date.now() / 1000 + 3600, access_token: "tok-return" }),
      );
      return { access_token: "tok-return", expired: false, state: "/" };
    });
    window.history.replaceState(null, "", "/?code=CODE-2244&state=STATE-2244");
    const end = startApp();
    try {
      render(
        <TransitionRouter>
          <ReturnApp />
        </TransitionRouter>,
      );

      // 1. The code exchange is pending: the return address says signed in, so the start frame shows the page of "Heute".
      expect(barTitles()).toEqual(["Heute"]);
      expectMainHoldsSomething("code exchange pending");

      // 2. The code is exchanged, the address goes back to "/" and the account loads; the shell's code is still on its way.
      gates.callback.open();
      await waitFor(() => expect(accountAsked).toBe(true));
      await new Promise((done) => setTimeout(done, 20));
      expect(window.location.search).toBe("");
      expect(barTitles()).toEqual(["Heute"]);
      expectMainHoldsSomething("account loaded, shell code loading");

      // 3. The shell is mounted; its route table is still on its way: the route's fallback holds the title and the body.
      gates.shell.open();
      await screen.findByRole("navigation", { name: "Navigation unten" });
      expect(barTitles()).toEqual(["Heute"]);
      expectMainHoldsSomething("routes loading");

      // 4. The routes are in: "/" redirects to "Heute"; the code of "Heute" is still on its way (its skeleton holds the main).
      gates.routes.open();
      await waitFor(() => expect(window.location.pathname).toBe("/today"));
      await new Promise((done) => setTimeout(done, 50));
      expect(barTitles()).toEqual(["Heute"]);
      expectMainHoldsSomething("Heute loading");

      // 5. The code of "Heute" is in: its content replaces the skeleton, the title stays in the bar.
      gates.today.open();
      await waitFor(() =>
        expect(
          within(document.querySelector("main") as HTMLElement)
            .queryAllByRole("status")
            .some((s) => s.textContent?.includes("Heute wird geladen")),
        ).toBe(false),
      );
      expect(barTitles()).toEqual(["Heute"]);
      expectMainHoldsSomething("content");
    } finally {
      end();
    }
  });
});

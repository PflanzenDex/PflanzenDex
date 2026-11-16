// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { beginAppStart } from "@/shared/ui/display/skeleton/delayed-skeleton/delayed-skeleton";

// The chunks of the start are held until the test opens them, one stage after the other (issue 2230): the sign-in check, the
// shell's code, the route table and the code of "Heute". The app and its modules run for real.
const gates = vi.hoisted(() => {
  const gate = () => {
    let open!: () => void;
    const promise = new Promise<void>((done) => (open = done));
    return { promise, open };
  };
  return { session: gate(), shell: gate(), routes: gate(), today: gate() };
});
const mgr = vi.hoisted(() => ({ getUser: vi.fn() }));

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
    removeUser = vi.fn(async () => undefined);
    signinRedirect = vi.fn(async () => undefined);
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
});

describe("US-QS-32 the start hands over to Heute in one picture (SG-STATE-02, issue 2230)", () => {
  it("US-QS-32 · the title and the skeleton of Heute hold through every stage of the start: one title in the bar, never an empty main", async () => {
    const end = beginAppStart();
    try {
      render(
        <MemoryRouter initialEntries={["/today"]}>
          <App />
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
});

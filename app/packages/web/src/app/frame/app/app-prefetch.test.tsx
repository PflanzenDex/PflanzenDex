// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { PATHS } from "../../../shared/patterns/navigation/navigation/navigation";

// The sign-in service is a foreign system: UserManager is replaced, the app runs for real.
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

// The module of "Heute" counts its evaluations (it runs once per file): the app asks for it before a route does.
const heute = vi.hoisted(() => ({ evaluated: 0 }));
vi.mock("@/app/destinations/today-area/today-area", async (importOriginal) => {
  heute.evaluated += 1;
  return importOriginal<typeof import("@/app/destinations/today-area/today-area")>();
});

import { App } from "./app";

const account = {
  id: "1",
  email: "lena@example.test",
  displayName: "Lena",
  emailConfirmed: true,
  mayShareWithFriends: true,
};

// Every request answers; the account is the only one the session needs (the rest may fail, the test does not wait for it).
function serveAccount() {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url) => {
      const path = new URL(String(url)).pathname;
      const body = path === "/account" ? account : {};
      return new Response(JSON.stringify(body), { status: path === "/account" ? 200 : 404 });
    }),
  );
}

beforeEach(() => {
  // The silent sign-in has been tried (app.test does the same), so a signed-out visitor sees the welcome page at once.
  window.sessionStorage.setItem("pflanzendex.silent_tried", "1");
  window.history.replaceState({}, "", "/");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// Order matters: the signed-out visitor runs first, because a module that was evaluated stays evaluated for this file.
describe("NFR-12 · DS-08 Heute, the landing page, is fetched while the account loads", () => {
  it("NFR-12 · DS-08 a signed-out visitor does not fetch Heute", async () => {
    mgr.getUser.mockResolvedValue(null);
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    await screen.findByRole("button", { name: "Anmelden" });
    expect(heute.evaluated).toBe(0);
  });

  it("NFR-12 · DS-08 a signed-in account fetches Heute while the route it opens is another page", async () => {
    mgr.getUser.mockResolvedValue({ access_token: "tok", expired: false });
    serveAccount();
    render(
      <MemoryRouter initialEntries={[PATHS.collection]}>
        <App />
      </MemoryRouter>,
    );
    await screen.findByRole("navigation", { name: "Hauptnavigation" });
    await waitFor(() => expect(heute.evaluated).toBe(1));
  });
});

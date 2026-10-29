// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { FeaturesProvider } from "@/kernel";
import { setViewportWidth } from "@/lib/viewport-mock";
import { AccountIndex } from "./account-index";

const account = {
  id: "1",
  email: "lena@example.test",
  displayName: "Lena",
  timeZone: null,
  emailConfirmed: true,
  mayShareWithFriends: true,
};
const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

type Answers = { profile?: unknown; achievements?: unknown; connections?: unknown };

function fakeServer(a: Answers = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url) => {
      const path = new URL(String(url)).pathname;
      const fail = () => json(500, { error: { code: "server.error", text: "x" } });
      if (path === "/account/profile")
        return a.profile === null
          ? fail()
          : json(
              200,
              a.profile ?? {
                displayName: "Lena",
                timeZone: "Europe/Berlin",
                notifications: { phase: true, swap: false },
              },
            );
      if (path === "/achievements")
        return a.achievements === null
          ? fail()
          : json(200, a.achievements ?? { calmMode: false, earnedCount: 3 });
      if (path === "/ai/connections")
        return a.connections === null
          ? fail()
          : json(
              200,
              a.connections ?? {
                connections: [
                  { id: "a", revokedAt: null },
                  { id: "b", revokedAt: "x" },
                ],
              },
            );
      return json(404, {});
    }),
  );
}

const show = (
  props: { signOut?: () => void; everywhere?: () => void; ai?: boolean; current?: "settings" } = {},
) =>
  render(
    <FeaturesProvider features={{ social: true, ai: props.ai ?? true, recommendations: false }}>
      <MemoryRouter initialEntries={["/account"]}>
        <AccountIndex
          api="http://api"
          token={async () => "tok"}
          account={account}
          current={props.current}
          hasOverview
          onSignOut={props.signOut ?? (() => undefined)}
          onEverywhereSignOut={props.everywhere ?? (() => undefined)}
        />
      </MemoryRouter>
    </FeaturesProvider>,
  );

beforeAll(() => setViewportWidth(1024)); // the dialog; the sheet of a phone is the same content (jsdom has no pointer capture)
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-QS-17 the index of Konto", () => {
  it("US-QS-17 shows the profile row, a row per section with its current value and Abmelden…", async () => {
    fakeServer();
    show();
    const list = screen.getByRole("navigation", { name: "Abschnitte von Konto" });
    expect(within(list).getByRole("link", { name: /Lena.*lena@example\.test/ })).toBeTruthy();
    const value = (name: RegExp, text: string) =>
      waitFor(() => expect(within(list).getByRole("link", { name }).textContent).toContain(text));
    await value(/^Einstellungen/, "Lena · Europe/Berlin");
    await value(/^Erinnerungen/, "an");
    await value(/^Erfolge/, "3");
    await value(/^KI-Clients/, "1");
    expect(within(list).getByRole("link", { name: "Was wird gemessen?" })).toBeTruthy();
    expect(within(list).getByRole("link", { name: "Was die App kann" })).toBeTruthy();
    expect(within(list).getByRole("link", { name: "Meine Daten" })).toBeTruthy();
    expect(within(list).getByRole("button", { name: "Abmelden…" })).toBeTruthy();
  });

  it("US-QS-17 · P-08 a value that cannot be read says unbekannt", async () => {
    fakeServer({ profile: null, achievements: null, connections: null });
    show();
    for (const name of [/^Einstellungen/, /^Erinnerungen/, /^Erfolge/, /^KI-Clients/])
      await waitFor(() =>
        expect(screen.getByRole("link", { name }).textContent).toContain("unbekannt"),
      );
  });

  it("US-QS-17 · US-ACH-08 calm mode hides the row Erfolge, the function ai hides KI-Clients", async () => {
    fakeServer({ achievements: { calmMode: true } });
    show({ ai: false });
    await screen.findByRole("link", { name: /^Einstellungen.*Lena/ });
    expect(screen.queryByRole("link", { name: /^Erfolge/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /^KI-Clients/ })).toBeNull();
  });

  it("US-QS-17 the row of the open section is marked by aria-current beside the index", async () => {
    fakeServer();
    show({ current: "settings" });
    const current = await screen.findByRole("link", { name: /^Einstellungen/ });
    expect(current.getAttribute("aria-current")).toBe("page");
    expect(
      screen.getByRole("link", { name: /^Meine Daten/ }).getAttribute("aria-current"),
    ).toBeNull();
  });

  it("US-QS-17 Abmelden… opens a confirmation with Abmelden, Auf allen Geräten abmelden and a way to cancel", async () => {
    fakeServer();
    const signOut = vi.fn();
    const everywhere = vi.fn();
    show({ signOut, everywhere });
    await userEvent.click(screen.getByRole("button", { name: "Abmelden…" }));
    const dialog = await screen.findByRole("dialog", { name: "Abmelden?" });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Auf allen Geräten abmelden" }),
    );
    expect(everywhere).toHaveBeenCalledOnce();
    await userEvent.click(within(dialog).getByRole("button", { name: "Abmelden" }));
    expect(signOut).toHaveBeenCalledOnce();
    await userEvent.click(within(dialog).getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

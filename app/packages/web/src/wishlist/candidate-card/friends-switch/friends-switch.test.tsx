// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeaturesProvider } from "../../../kernel";
import FriendsSwitch from "./friends-switch";
import { LazyFriendsSwitch } from "../lazy-friends-switch/lazy-friends-switch";

// DM-TAU-02, US-TAU-05, P-05, P-09, P-10: the switch "Für Freunde als gesucht zeigen" of a wish.
const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";
const props = { api: "http://api", token, wishId: "w1", title: "Korbmarante" };

function server(marked: string[], post?: () => Promise<Response>) {
  let ids = marked;
  const fetchFn = vi.fn<typeof fetch>(async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (path === "/wishes/visible-to-friends") return response(200, { wishIds: ids });
    if (path === "/wishes/w1/visibility" && init?.method === "POST") {
      if (post) return post();
      const visible = JSON.parse(String(init.body)).visible as boolean;
      ids = visible ? ["w1"] : [];
      return response(200, {
        wishId: "w1",
        visible,
        changed: true,
        hint: { text: "x", nextAction: "y" },
      });
    }
    return response(404, {});
  });
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DM-TAU-02 the switch of a wish for friends", () => {
  it("DM-TAU-02 is off by default, says what it does and keeps the list private", async () => {
    server([]);
    render(<FriendsSwitch {...props} />);
    const box = (await screen.findByRole("checkbox", {
      name: "Für Freunde als gesucht zeigen: Korbmarante",
    })) as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(document.body.textContent).toContain("Passt in beide Richtungen");
    expect(document.body.textContent).toContain("nie deine Liste");
  });

  it("US-TAU-05 a tap marks the wish and a second tap takes it back; the message says what changed", async () => {
    const fetchFn = server([]);
    render(<FriendsSwitch {...props} />);
    const box = (await screen.findByRole("checkbox")) as HTMLInputElement;
    await userEvent.click(box);
    expect(
      await screen.findByText(/ist jetzt für bestätigte Freunde als gesucht sichtbar/),
    ).toBeTruthy();
    await waitFor(() =>
      expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true),
    );
    const sent = fetchFn.mock.calls.find((c) => String(c[0]).endsWith("/wishes/w1/visibility"));
    expect(JSON.parse(String(sent?.[1]?.body))).toEqual({ visible: true });
    await userEvent.click(screen.getByRole("checkbox"));
    expect(await screen.findByText(/ist wieder privat/)).toBeTruthy();
    await waitFor(() =>
      expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false),
    );
  });

  it("P-10 a refusal stays visible with the German text and the switch stays as it was", async () => {
    server([], () =>
      response(409, {
        error: {
          code: "wish.not_open_for_friends",
          text: "Dieser Wunsch ist gekauft oder verworfen.",
        },
      }),
    );
    render(<FriendsSwitch {...props} />);
    await userEvent.click(await screen.findByRole("checkbox"));
    expect((await screen.findByRole("alert")).textContent).toContain("gekauft");
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
  });

  it("US-DEV-06 the switch does not exist while the social part is off", async () => {
    const fetchFn = server([]);
    render(
      <FeaturesProvider features={{ social: false }}>
        <LazyFriendsSwitch {...props} />
      </FeaturesProvider>,
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

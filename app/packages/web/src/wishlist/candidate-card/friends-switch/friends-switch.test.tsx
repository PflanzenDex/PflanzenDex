// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnnouncerProvider } from "@/shared/platform/announcer/announcer";
import { FeaturesProvider } from "../../../shared/data";
import FriendsSwitch from "./friends-switch";
import { LazyFriendsSwitch } from "../lazy-friends-switch/lazy-friends-switch";

// DM-TAU-02, US-TAU-05, US-QS-32, P-05, P-09, P-10: the switch row "Für Freunde sichtbar" of a wish.
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

/** The switch of the row; its name is the visible label and the wish's title for assistive technology. */
const toggle = () => screen.findByRole("switch", { name: "Für Freunde sichtbar: Korbmarante" });
const isOn = (el: HTMLElement) => el.getAttribute("aria-checked") === "true";
const announced = () =>
  document.querySelector<HTMLElement>('.sr-only[aria-live="polite"]')?.textContent ?? "";
const show = (child = <FriendsSwitch {...props} />) =>
  render(<AnnouncerProvider>{child}</AnnouncerProvider>);

describe("DM-TAU-02 the switch of a wish for friends", () => {
  it("DM-TAU-02 · US-QS-32 is a switch row, off by default, with one line that says what friends see and that the list stays private", async () => {
    server([]);
    show();
    const box = await toggle();
    expect(isOn(box)).toBe(false);
    expect(screen.queryByRole("checkbox")).toBeNull();
    const line = document.getElementById(box.getAttribute("aria-describedby") ?? "");
    expect(line?.textContent).toContain("Passt in beide Richtungen");
    expect(line?.textContent).toContain("nie deine Liste");
  });

  it("US-TAU-05 · US-QS-32 a tap marks the wish and a second tap takes it back; the switch is the result and the line does not change", async () => {
    const fetchFn = server([]);
    show();
    const box = await toggle();
    const line = () =>
      document.getElementById(box.getAttribute("aria-describedby") ?? "")?.textContent;
    const before = line();
    await userEvent.click(box);
    await waitFor(() => expect(isOn(box)).toBe(true));
    await vi.waitFor(() =>
      expect(announced()).toMatch(/ist jetzt für bestätigte Freunde als gesucht sichtbar/),
    );
    const sent = fetchFn.mock.calls.find((c) => String(c[0]).endsWith("/wishes/w1/visibility"));
    expect(JSON.parse(String(sent?.[1]?.body))).toEqual({ visible: true });
    // The result is said once: no status box beside the moved switch, and the line under the label stays the same.
    expect(screen.queryByRole("status")).toBeNull();
    expect(line()).toBe(before);
    await userEvent.click(box);
    await waitFor(() => expect(isOn(box)).toBe(false));
    await vi.waitFor(() => expect(announced()).toMatch(/ist wieder privat/));
    expect(line()).toBe(before);
  });

  it("US-QS-32 the switch moves at the tap, before the answer of the server (optimistic)", async () => {
    let answer: () => void = () => undefined;
    server(
      [],
      () =>
        new Promise<Response>((resolve) => {
          answer = () =>
            resolve(
              new Response(
                JSON.stringify({
                  wishId: "w1",
                  visible: true,
                  changed: true,
                  hint: { text: "x", nextAction: "y" },
                }),
                { status: 200 },
              ),
            );
        }),
    );
    show();
    const box = await toggle();
    await userEvent.click(box);
    expect(isOn(box)).toBe(true);
    // A tap while the write runs sends nothing and keeps the focus on the switch.
    expect(box.getAttribute("aria-disabled")).toBe("true");
    answer();
    await waitFor(() => expect(box.getAttribute("aria-disabled")).toBeNull());
  });

  it("P-10 · US-QS-32 a refusal rolls the switch back, shows the German text at the row once and says nothing as a result", async () => {
    server([], () =>
      response(409, {
        error: {
          code: "wish.not_open_for_friends",
          text: "Dieser Wunsch ist gekauft oder verworfen.",
        },
      }),
    );
    show();
    const box = await toggle();
    await userEvent.click(box);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("gekauft");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(box.closest("div")?.parentElement?.contains(alert)).toBe(true);
    expect(box.getAttribute("aria-describedby")).toContain(alert.id);
    await waitFor(() => expect(isOn(box)).toBe(false));
    expect(announced()).toBe("");
    // Only a key conflict has the control that frees its key (US-QS-03).
    expect(screen.queryByRole("button", { name: "Hinweis schließen" })).toBeNull();
  });

  it("US-QS-03 · P-10 a key conflict of the switch offers 'Hinweis schließen': the notice goes and the focus returns to the switch", async () => {
    server([], () => response(409, { error: { code: "idempotency.key_conflict", text: "x" } }));
    show();
    const box = await toggle();
    await userEvent.click(box);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Deine erste Eingabe ist gesichert.");
    await userEvent.click(within(alert).getByRole("button", { name: "Hinweis schließen" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.activeElement).toBe(box);
  });

  it("US-DEV-06 the switch does not exist while the social part is off", async () => {
    const fetchFn = server([]);
    show(
      <FeaturesProvider features={{ social: false }}>
        <LazyFriendsSwitch {...props} />
      </FeaturesProvider>,
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("switch")).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

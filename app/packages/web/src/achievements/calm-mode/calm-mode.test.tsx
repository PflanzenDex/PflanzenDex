// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnnouncerProvider } from "@/shared/platform/announcer/announcer";
import { CalmModeSection } from "./calm-mode";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";

function fakeServer(initial: boolean, put: (body: unknown) => Promise<Response>) {
  const puts: { body: Record<string, unknown>; key: string | undefined }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path === "/achievements/settings" && init?.method !== "PUT") {
        return response(200, { calmMode: initial });
      }
      if (path === "/achievements/settings/calm-mode" && init?.method === "PUT") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        puts.push({ body, key: (init.headers as Record<string, string>)["Idempotency-Key"] });
        return put(body);
      }
      return response(404, {});
    }),
  );
  return puts;
}
const show = () =>
  render(
    <AnnouncerProvider>
      <CalmModeSection api="http://api" token={token} />
    </AnnouncerProvider>,
  );

/** What the announcer says (its polite live region, `sr-only`). */
const announced = () =>
  document.querySelector<HTMLElement>('.sr-only[aria-live="polite"]')?.textContent ?? "";
const isOn = (toggle: HTMLElement) => toggle.getAttribute("aria-checked") === "true";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("US-ACH-08 calm mode switch", () => {
  it("US-ACH-08 · US-QS-32 shows the stored state, off by default, as a switch row with one line that says what it does", async () => {
    fakeServer(false, (b) => response(200, b));
    show();
    const toggle = await screen.findByRole("switch", { name: "Ruhemodus" });
    expect(isOn(toggle)).toBe(false);
    expect(screen.queryByRole("checkbox")).toBeNull();
    const line = document.getElementById(toggle.getAttribute("aria-describedby") ?? "");
    expect(line?.textContent).toBe("Blendet Erfolge aus.");
  });

  it("US-ACH-08 · US-QS-32 one tap saves with an Idempotency-Key; the switch is the result and the announcer says it once", async () => {
    const puts = fakeServer(false, (b) => response(200, b));
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("switch", { name: "Ruhemodus" }));
    await vi.waitFor(() => expect(announced()).toBe("Ruhemodus ist an."));
    expect(puts).toHaveLength(1);
    expect(puts[0]?.body).toEqual({ calmMode: true });
    expect(puts[0]?.key).toBeTruthy();
    expect(isOn(screen.getByRole("switch"))).toBe(true);
    // No second result box in the page (SG-FEED-02, SG-FEED-04): the moved switch is the result.
    expect(screen.queryByRole("status")).toBeNull();
    await user.click(screen.getByRole("switch", { name: "Ruhemodus" }));
    await vi.waitFor(() => expect(announced()).toBe("Ruhemodus ist aus."));
  });

  it("US-ACH-08 · P-10 a refusal stays visible at the row and the switch keeps the stored state", async () => {
    fakeServer(false, () =>
      response(400, { error: { code: "input.invalid", text: "x", details: [] } }),
    );
    const user = userEvent.setup();
    show();
    const toggle = await screen.findByRole("switch", { name: "Ruhemodus" });
    await user.click(toggle);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBeTruthy();
    expect(toggle.getAttribute("aria-describedby")).toContain(alert.id);
    expect(isOn(screen.getByRole("switch"))).toBe(false);
    expect(screen.queryByRole("status")).toBeNull();
    expect(announced()).toBe("");
  });
});

describe("US-QS-30 calm mode switch offline", () => {
  it("US-QS-30 offline the calm mode switch does not save, keeps the stored state and says why", async () => {
    const puts = fakeServer(false, (b) => response(200, b));
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    const user = userEvent.setup();
    show();
    const box = await screen.findByRole("switch", { name: "Ruhemodus" });
    await user.click(box);
    expect(puts).toHaveLength(0);
    expect(isOn(box)).toBe(false);
    expect(box.getAttribute("aria-disabled")).toBe("true");
    const described = (box.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent);
    expect(described).toContain("Du bist offline. Das geht erst wieder mit Verbindung.");
  });
});

describe("US-QS-32 · P-10 calm mode switch: a failed load is one row, not a card in the list", () => {
  it("US-QS-32 a failed load reads 'Nicht geladen' with 'Erneut versuchen' in one row, and the retry shows the switch", async () => {
    let failing = true;
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        failing
          ? response(500, { error: { code: "internal", text: "x" } })
          : response(200, { calmMode: true }),
      ),
    );
    const user = userEvent.setup();
    show();
    const retry = await screen.findByRole("button", { name: "Erneut versuchen: Ruhemodus" });
    expect(screen.getByText("Nicht geladen")).toBeTruthy();
    expect(screen.getByText("Ruhemodus")).toBeTruthy();
    expect(screen.queryByRole("switch")).toBeNull();
    // One row: no empty-state icon and no alert card (SG-STATE-03).
    expect(screen.queryByRole("alert")).toBeNull();
    failing = false;
    await user.click(retry);
    expect(isOn(await screen.findByRole("switch", { name: "Ruhemodus" }))).toBe(true);
  });
});

// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { InvitationPage } from "./invitation-page";

const token = async () => "tok";
const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const INVALID = {
  error: {
    code: "invitation.invalid",
    text: "Dieser Einladungscode ist ungültig, abgelaufen oder schon benutzt.",
  },
};

let onRegistered: Mock<() => void>;
let onSignOut: Mock<() => void>;
const open = () =>
  render(
    <InvitationPage
      api="http://api"
      token={token}
      onRegistered={onRegistered}
      onSignOut={onSignOut}
    />,
  );

beforeEach(() => {
  onRegistered = vi.fn<() => void>();
  onSignOut = vi.fn<() => void>();
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(() => json(200, { registered: true })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-ACC-05 registration with an invitation code", () => {
  it("US-ACC-05 explains that registration needs a code and what to do without one (P-09)", () => {
    open();
    expect(screen.getByRole("heading", { name: "Einladungscode" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Einladungscode" })).toBeTruthy();
    expect(document.body.textContent).toMatch(/nur mit Einladung/);
    expect(document.body.textContent).toMatch(/keinen Code/);
  });

  it("US-ACC-05 sends the code with the bearer token and goes on once registered", async () => {
    open();
    const user = userEvent.setup();
    await user.type(
      screen.getByRole("textbox", { name: "Einladungscode" }),
      "  abcd-efgh-jkmn-pqrs-tvwx-yz01 ",
    );
    await user.click(screen.getByRole("button", { name: "Registrieren" }));
    await waitFor(() => expect(onRegistered).toHaveBeenCalledOnce());
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api/registration/invitation");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer tok");
    expect(JSON.parse(String(init.body))).toEqual({ code: "abcd-efgh-jkmn-pqrs-tvwx-yz01" });
  });

  it("US-ACC-05 a wrong, used or expired code shows the same refusal and keeps the input (P-10)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() => json(403, INVALID)),
    );
    open();
    const user = userEvent.setup();
    const field = screen.getByRole("textbox", { name: "Einladungscode" }) as HTMLInputElement;
    await user.type(field, "FALSCH");
    await user.click(screen.getByRole("button", { name: "Registrieren" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("ungültig, abgelaufen oder schon benutzt");
    expect(field.value).toBe("FALSCH");
    expect(onRegistered).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(field);
  });

  it("US-ACC-05 an empty field sends nothing and asks for the code", async () => {
    open();
    await userEvent.setup().click(screen.getByRole("button", { name: "Registrieren" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Bitte gib deinen Einladungscode ein.",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("US-ACC-05 a double tap sends one request", async () => {
    let answer: (r: Response) => void = () => undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() => new Promise<Response>((resolve) => (answer = resolve))),
    );
    open();
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox", { name: "Einladungscode" }), "ABCD");
    await user.dblClick(screen.getByRole("button", { name: "Registrieren" }));
    answer(new Response(JSON.stringify({ registered: true }), { status: 200 }));
    await waitFor(() => expect(onRegistered).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("US-ACC-05 an unreachable server is reported, not swallowed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() => Promise.reject(new Error("offline"))),
    );
    open();
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox", { name: "Einladungscode" }), "ABCD");
    await user.click(screen.getByRole("button", { name: "Registrieren" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/nicht erreichbar/);
  });

  it("US-ACC-05 the person can sign out instead", async () => {
    open();
    await userEvent.setup().click(screen.getByRole("button", { name: "Abmelden" }));
    expect(onSignOut).toHaveBeenCalledOnce();
  });
});

describe("US-ACC-05 · DS-48 states and primitives", () => {
  it("US-ACC-05 · DS-49 a refusal shows the German text of its error code, never the raw server text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() =>
        json(403, { error: { code: "invitation.invalid", text: "RAW SERVER TEXT" } }),
      ),
    );
    open();
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox", { name: "Einladungscode" }), "FALSCH");
    await user.click(screen.getByRole("button", { name: "Registrieren" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toContain("RAW SERVER TEXT");
    expect(alert.textContent).toContain("ungültig");
  });

  it("US-ACC-05 · DS-48 the refusal is linked to the field by aria-describedby and the field is marked", async () => {
    open();
    await userEvent.setup().click(screen.getByRole("button", { name: "Registrieren" }));
    const alert = await screen.findByRole("alert");
    const field = screen.getByRole("textbox", { name: "Einladungscode" });
    expect(field.getAttribute("aria-describedby")).toContain(alert.id);
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(field);
  });

  it("US-QS-09 the code can be pasted and offered by the device or a password manager (3.3.8)", async () => {
    open();
    const user = userEvent.setup();
    const field = screen.getByRole("textbox", { name: "Einladungscode" });
    expect(field.getAttribute("autocomplete")).toBe("one-time-code");
    expect(field.hasAttribute("readonly")).toBe(false);
    await user.click(field);
    await user.paste("ABCD-EFGH-JKMN");
    expect((field as HTMLInputElement).value).toBe("ABCD-EFGH-JKMN");
  });
});

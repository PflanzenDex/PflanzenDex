// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KeeperStyleSection } from "./keeper-style";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";

function fakeServer(initial: { style: string; chosen: boolean }, put?: () => Promise<Response>) {
  const puts: { body: Record<string, unknown>; key: string | undefined }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path !== "/onboarding/style") return response(404, {});
      if (init?.method !== "PUT") return response(200, initial);
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      puts.push({ body, key: (init.headers as Record<string, string>)["Idempotency-Key"] });
      return put ? put() : response(200, { style: body["style"], chosenOn: "2026-10-18" });
    }),
  );
  return puts;
}
const show = () => render(<KeeperStyleSection api="http://api" token={token} />);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-ONB-03 keeper style in the profile", () => {
  it("US-ONB-03 shows the stored style as one of two answers, without level or rank", async () => {
    fakeServer({ style: "many", chosen: true });
    show();
    const select = await screen.findByRole<HTMLSelectElement>("combobox", {
      name: "Wie nutzt du die App?",
    });
    expect(select.value).toBe("many");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Ich pflege ein paar Pflanzen",
      "Ich verwalte viel, zeig mir alles",
    ]);
    expect(screen.queryByText(/Level|Rang|Stufe/i)).toBeNull();
  });

  it("US-ONB-03 one tap switches the style at once with an Idempotency-Key and says what changed", async () => {
    const puts = fakeServer({ style: "few", chosen: true });
    const user = userEvent.setup();
    show();
    await user.selectOptions(await screen.findByRole("combobox"), "many");
    expect((await screen.findByRole("status")).textContent).toBe("Alles ist jetzt offen.");
    expect(puts).toHaveLength(1);
    expect(puts[0]?.body).toMatchObject({ style: "many" });
    expect(typeof puts[0]?.body["timeZone"]).toBe("string");
    expect(puts[0]?.key).toBeTruthy();
    expect(screen.getByRole<HTMLSelectElement>("combobox").value).toBe("many");
    expect(screen.getByText(/bleibt offen/)).toBeTruthy();
  });

  it("US-ONB-03 a refusal stays visible and the stored style stays selected (P-10)", async () => {
    fakeServer({ style: "few", chosen: true }, () =>
      response(400, { error: { code: "input.invalid", text: "x" } }),
    );
    const user = userEvent.setup();
    show();
    await user.selectOptions(await screen.findByRole("combobox"), "many");
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole<HTMLSelectElement>("combobox").value).toBe("few");
  });
});

// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
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
const show = () => render(<CalmModeSection api="http://api" token={token} />);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-ACH-08 calm mode switch", () => {
  it("US-ACH-08 shows the stored state, off by default, and says what the switch does", async () => {
    fakeServer(false, (b) => response(200, b));
    show();
    const box = await screen.findByRole<HTMLInputElement>("checkbox", { name: "Ruhemodus" });
    expect(box.checked).toBe(false);
    expect(screen.getByText(/blendet alle Erfolge/).textContent).toContain("Pokédex bleiben");
  });

  it("US-ACH-08 one tap saves with an Idempotency-Key and confirms what changed", async () => {
    const puts = fakeServer(false, (b) => response(200, b));
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("checkbox", { name: "Ruhemodus" }));
    expect((await screen.findByRole("status")).textContent).toBe("Ruhemodus ist an.");
    expect(puts).toHaveLength(1);
    expect(puts[0]?.body).toEqual({ calmMode: true });
    expect(puts[0]?.key).toBeTruthy();
    expect(screen.getByRole<HTMLInputElement>("checkbox").checked).toBe(true);
    expect(screen.getByText(/bleiben erhalten/)).toBeTruthy();
    await user.click(screen.getByRole("checkbox", { name: "Ruhemodus" }));
    expect((await screen.findByText("Ruhemodus ist aus.")).textContent).toBeTruthy();
  });

  it("US-ACH-08 a refusal stays visible and the switch keeps the stored state", async () => {
    fakeServer(false, () =>
      response(400, { error: { code: "input.invalid", text: "x", details: [] } }),
    );
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("checkbox", { name: "Ruhemodus" }));
    expect((await screen.findByRole("alert")).textContent).toBeTruthy();
    expect(screen.getByRole<HTMLInputElement>("checkbox").checked).toBe(false);
    expect(screen.queryByRole("status")).toBeNull();
  });
});

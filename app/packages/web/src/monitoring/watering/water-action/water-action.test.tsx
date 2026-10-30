// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WaterAction } from "./water-action";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const show = () =>
  render(
    <WaterAction
      api="http://api"
      token={async () => "tok"}
      specimen={{ id: "e1", name: "Aloe" }}
    />,
  );

describe("US-QS-23 Gießen of a plant", () => {
  it("US-QS-23 enters the watering through the existing operation and says what was entered", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => Response.json({ watered: [] }));
    vi.stubGlobal("fetch", fetchFn);
    show();
    await userEvent.click(screen.getByRole("button", { name: "Gießen: Aloe" }));
    expect((await screen.findByRole("status")).textContent).toBe(
      "„Aloe“ als gegossen eingetragen.",
    );
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(new URL(String(url)).pathname).toBe("/watering");
    expect(JSON.parse(String(init?.body))).toMatchObject({ specimenIds: ["e1"] });
  });

  it("US-QS-23 · P-10 a refusal stays visible with the German text of its code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        Response.json({ error: { code: "access.not_signed_in", text: "raw" } }, { status: 401 }),
      ),
    );
    show();
    await userEvent.click(screen.getByRole("button", { name: "Gießen: Aloe" }));
    expect((await screen.findByRole("alert")).textContent).not.toContain("raw");
  });
});

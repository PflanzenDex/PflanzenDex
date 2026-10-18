// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SpecimenCard } from "@pflanzendex/core";
import { hintOccasionsOf } from "../../../../collection/collection-page/hint-occasions/hint-occasions";
import { HINT_TEXTS } from "../hint-texts";
import { ContextHint } from "./context-hint";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

function server(due: string | null) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const u = new URL(String(url));
      calls.push(`${init?.method ?? "GET"} ${u.pathname}${u.search}`);
      if (u.pathname === "/onboarding/hints")
        return response(200, { hint: due, guideEnded: false });
      return response(200, { occasion: u.pathname.split("/").at(-1) });
    }),
  );
  return calls;
}

const card = (extra: Partial<SpecimenCard>): SpecimenCard =>
  ({
    id: "e1",
    name: "Bogenhanf",
    status: "plant",
    location: "Regal",
    lastMeasurement: null,
    ...extra,
  }) as SpecimenCard;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-ONB-07 hints of the other occasions", () => {
  it("US-ONB-07 plant_without_place: the note shows at the list, is recorded as shown and 'Okay' dismisses it per account", async () => {
    const calls = server("plant_without_place");
    render(
      <ContextHint
        api="http://api"
        token={async () => "tok"}
        applicable={["plant_without_place"]}
      />,
    );
    expect(await screen.findByText(HINT_TEXTS.plant_without_place)).toBeTruthy();
    expect(calls[0]).toContain("applicable=plant_without_place");
    await waitFor(() => expect(calls).toContain("PUT /onboarding/hints/plant_without_place"));
    await userEvent.click(screen.getByRole("button", { name: "Okay" }));
    await waitFor(() => expect(screen.queryByText(HINT_TEXTS.plant_without_place)).toBeNull());
  });

  it("US-ONB-07 first_measurement and function_unlocked show their own short texts", async () => {
    server("first_measurement");
    render(
      <ContextHint api="http://api" token={async () => "tok"} applicable={["first_measurement"]} />,
    );
    expect(await screen.findByText(HINT_TEXTS.first_measurement)).toBeTruthy();
    cleanup();
    server("function_unlocked");
    render(
      <ContextHint api="http://api" token={async () => "tok"} applicable={["function_unlocked"]} />,
    );
    expect(await screen.findByText(HINT_TEXTS.function_unlocked)).toBeTruthy();
  });

  it("US-ONB-07 the hint is announced as text (status) and reachable and dismissable by keyboard (NFR-13)", async () => {
    server("first_measurement");
    render(
      <ContextHint api="http://api" token={async () => "tok"} applicable={["first_measurement"]} />,
    );
    expect((await screen.findByRole("status")).textContent).toContain(HINT_TEXTS.first_measurement);
    await userEvent.tab();
    expect(document.activeElement?.textContent).toBe("Okay");
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });

  it("US-ONB-07 nothing is due (calm mode, style many, dismissed): no note", async () => {
    const calls = server(null);
    render(
      <ContextHint
        api="http://api"
        token={async () => "tok"}
        applicable={["plant_without_place"]}
      />,
    );
    await waitFor(() => expect(calls.length).toBe(1));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("US-ONB-07 US-ONB-02 the occasions of the list: no place and no measurement yet; archived plants do not count", () => {
    expect(hintOccasionsOf([])).toEqual([]);
    expect(hintOccasionsOf([card({ location: null })])).toEqual([
      "plant_without_place",
      "first_measurement",
    ]);
    expect(
      hintOccasionsOf([
        card({ lastMeasurement: { value: 1 } as SpecimenCard["lastMeasurement"] }),
        card({ id: "e2", status: "archived", location: null }),
      ]),
    ).toEqual([]);
  });
});

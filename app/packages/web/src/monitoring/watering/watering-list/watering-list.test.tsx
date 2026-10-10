// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../../kernel";
import { WateringList } from "./watering-list";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";
const ficus = {
  specimenId: "s1",
  name: "Ficus",
  intervalDays: 7,
  lastWateredOn: "2026-10-03",
  daysSince: 7,
};
const aloe = {
  specimenId: "s2",
  name: "Aloe",
  intervalDays: 14,
  lastWateredOn: null,
  daysSince: 14,
};

function fakeServer(initial: unknown[]) {
  let due = initial;
  const posts: { specimenIds: string[]; timeZone: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path === "/watering" && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { specimenIds: string[]; timeZone: string };
        posts.push(body);
        due = due.filter(
          (d) => !body.specimenIds.includes((d as { specimenId: string }).specimenId),
        );
        return response(200, { date: "2026-10-10", created: body.specimenIds.length });
      }
      return path === "/watering/due" ? response(200, { due }) : response(404, {});
    }),
  );
  return posts;
}
const show = () =>
  render(
    <QueryClientProvider client={createQueryClient()}>
      <WateringList api="http://api" token={token} />
    </QueryClientProvider>,
  );
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-MON-05 watering list", () => {
  it("US-MON-05 lists the due plants with the last watering, the interval and 'noch nie' without an entry", async () => {
    fakeServer([ficus, aloe]);
    show();
    expect(
      await screen.findByText(/zuletzt vor 7 Tagen gegossen, Intervall alle 7 Tage/),
    ).toBeTruthy();
    expect(
      screen.getByText(/noch nie als gegossen eingetragen, Intervall alle 14 Tage/),
    ).toBeTruthy();
  });

  it("US-MON-05 says why the list is empty and where the interval is set (P-08, P-09)", async () => {
    fakeServer([]);
    show();
    expect(await screen.findByText("Heute nichts zu gießen")).toBeTruthy();
    expect(screen.getByText(/Pflegeprofil/)).toBeTruthy();
  });

  it("US-MON-05 'Gegossen' writes today's entry for that plant and the row disappears", async () => {
    const posts = fakeServer([ficus, aloe]);
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("button", { name: "Ficus als gegossen eintragen" }));
    expect((await screen.findByRole("status")).textContent).toBe("Als gegossen eingetragen.");
    expect(posts).toHaveLength(1);
    expect(posts[0]?.specimenIds).toEqual(["s1"]);
    expect(posts[0]?.timeZone).toBeTruthy();
    expect(screen.queryByText("Ficus")).toBeNull();
  });

  it("US-MON-05 several marked plants are entered in one step", async () => {
    const posts = fakeServer([ficus, aloe]);
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("checkbox", { name: /Ficus/ }));
    await user.click(screen.getByRole("checkbox", { name: /Aloe/ }));
    await user.click(screen.getByRole("button", { name: "2 als gegossen eintragen" }));
    await screen.findByText("Heute nichts zu gießen");
    expect(posts).toHaveLength(1);
    expect(posts[0]?.specimenIds).toEqual(["s1", "s2"]);
  });

  it("US-MON-05 shows a refusal of the server and keeps the list (P-10)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url, init) =>
        init?.method === "POST"
          ? response(404, {
              error: { code: "specimen.not_found", text: "Dieses Exemplar gibt es nicht." },
            })
          : response(200, { due: [ficus] }),
      ),
    );
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("button", { name: "Ficus als gegossen eintragen" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Dieses Exemplar gibt es nicht.");
    expect(screen.getByText("Ficus")).toBeTruthy();
  });
});

// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../../shared/data";
import { AnnouncerProvider } from "../../../shared/platform/announcer/announcer";
import { hasOwnBorder, isTinted } from "@/shared/ui/button.roles";
import { WateringList } from "./watering-list";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";
/** The result line on the page; the announcer's copy is hidden (`sr-only`) and is not matched. */
const resultLine = (text: string) => screen.getByText(text, { ignore: ".sr-only" });
/** What the announcer says (its polite live region, `sr-only`). */
const announced = () =>
  document.querySelector<HTMLElement>('.sr-only[aria-live="polite"]')?.textContent ?? "";
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
  const undos: string[][] = [];
  const idOf = (d: unknown) => (d as { specimenId: string }).specimenId;
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const path = new URL(String(url)).pathname;
      const body = init?.body
        ? (JSON.parse(String(init.body)) as { specimenIds: string[]; timeZone: string })
        : null;
      if (path === "/watering" && init?.method === "POST" && body) {
        posts.push(body);
        due = due.filter((d) => !body.specimenIds.includes(idOf(d)));
        return response(200, { date: "2026-10-10", created: body.specimenIds.length });
      }
      if (path === "/watering/unwater" && body) {
        undos.push(body.specimenIds);
        const back = initial.filter(
          (d) => body.specimenIds.includes(idOf(d)) && !due.some((x) => idOf(x) === idOf(d)),
        );
        due = [...due, ...back];
        return response(200, { date: "2026-10-10", specimens: body.specimenIds, removed: 1 });
      }
      return path === "/watering/due" ? response(200, { due }) : response(404, {});
    }),
  );
  return Object.assign(posts, { undos });
}

// The app shell mounts the announcer above the page; the result line is said through it (US-QS-32).
const show = () =>
  render(
    <AnnouncerProvider>
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter>
          <WateringList api="http://api" token={token} />
        </MemoryRouter>
      </QueryClientProvider>
    </AnnouncerProvider>,
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

  it("US-MON-05 · US-QS-32 · issue 2240 the empty list is its line only, with no link or button", async () => {
    fakeServer([]);
    show();
    expect(await screen.findByText(/^Heute nichts zu gießen\.$/)).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("US-QS-32 the bulk button shows only from two marks and reads '2 eintragen'; below two the hint is text, not a button", async () => {
    fakeServer([ficus, aloe]);
    const user = userEvent.setup();
    show();
    const bulk = () => screen.queryByRole("button", { name: /^\d+ eintragen$/ });
    const hint = "Mehrere markieren, dann gemeinsam eintragen";
    expect(
      await screen.findByRole("button", { name: "Ficus als gegossen eintragen" }),
    ).toBeTruthy();
    expect(bulk()).toBeNull();
    expect(screen.getByText(hint).tagName).toBe("P");
    await user.click(screen.getByRole("checkbox", { name: /Ficus/ }));
    expect(bulk()).toBeNull();
    expect(screen.getByText(hint)).toBeTruthy();
    await user.click(screen.getByRole("checkbox", { name: /Aloe/ }));
    expect(screen.getByRole("button", { name: "2 eintragen" })).toBeTruthy();
    expect(screen.queryByText(hint)).toBeNull();
  });

  it("US-MON-05 'Gegossen' writes today's entry for that plant; the row stays in its place with its undo", async () => {
    const posts = fakeServer([ficus, aloe]);
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("button", { name: "Ficus als gegossen eintragen" }));
    await screen.findByRole("button", { name: "Rückgängig: Ficus" });
    expect(posts).toHaveLength(1);
    expect(posts[0]?.specimenIds).toEqual(["s1"]);
    expect(posts[0]?.timeZone).toBeTruthy();
    expect(screen.getByText("Ficus")).toBeTruthy();
    expect(announced()).toBe("Gegossen");
  });

  it("US-QS-32 · SG-BTN-02 each due row has one tinted button without a border (FX-39 sweep 3)", async () => {
    fakeServer([ficus, aloe]);
    show();
    for (const name of ["Ficus als gegossen eintragen", "Aloe als gegossen eintragen"]) {
      const row = await screen.findByRole("button", { name });
      expect(isTinted(row), name).toBe(true);
      expect(hasOwnBorder(row), name).toBe(false);
    }
  });

  it("US-QS-32 'Rückgängig' takes the plant back with one request to the undo route; the plant is due again", async () => {
    const posts = fakeServer([ficus, aloe]);
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("button", { name: "Ficus als gegossen eintragen" }));
    await user.click(await screen.findByRole("button", { name: "Rückgängig: Ficus" }));
    await screen.findByRole("button", { name: "Ficus als gegossen eintragen" });
    expect(posts.undos).toEqual([["s1"]]);
    expect(announced()).toBe("Rückgängig gemacht.");
  });

  it("US-QS-32 the held row is gone after 8 s without a tap; the list then shows its empty line", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      fakeServer([ficus]);
      show();
      fireEvent.click(await screen.findByRole("button", { name: "Ficus als gegossen eintragen" }));
      await screen.findByRole("button", { name: "Rückgängig: Ficus" });
      act(() => vi.advanceTimersByTime(8000));
      expect(screen.queryByRole("button", { name: "Rückgängig: Ficus" })).toBeNull();
      await screen.findByText(/^Heute nichts zu gießen\./);
    } finally {
      vi.useRealTimers();
    }
  });

  it("US-QS-32 · F-0075 after the last plant is marked, its held row stays in place: no empty line while it is held", async () => {
    fakeServer([ficus]);
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("button", { name: "Ficus als gegossen eintragen" }));
    await screen.findByRole("button", { name: "Rückgängig: Ficus" });
    expect(screen.queryByText(/^Heute nichts zu gießen\./)).toBeNull();
  });

  it("US-QS-32 several plants marked at once: one undo below the list takes all of them back, the rows keep their place", async () => {
    const posts = fakeServer([ficus, aloe]);
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("checkbox", { name: /Ficus/ }));
    await user.click(screen.getByRole("checkbox", { name: /Aloe/ }));
    await user.click(screen.getByRole("button", { name: "2 eintragen" }));
    const undo = await screen.findByRole("button", { name: "Rückgängig: 2 Pflanzen" });
    expect(undo.closest("p")?.textContent).toBe("2 Pflanzen gegossen · Rückgängig");
    expect(screen.getByText("Ficus")).toBeTruthy();
    expect(screen.getByText("Aloe")).toBeTruthy();
    expect(posts[0]?.specimenIds).toEqual(["s1", "s2"]);
    await user.click(undo);
    await screen.findByRole("checkbox", { name: /Ficus/ });
    expect(posts.undos).toEqual([["s1", "s2"]]);
  });

  it("US-QS-32 · F-0075 a plant that was entered earlier today has nothing to undo: the result stays a line above the list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url, init) => {
        const path = new URL(String(url)).pathname;
        if (path === "/watering" && init?.method === "POST")
          return response(200, { date: "2026-10-10", created: 0 });
        return response(200, { due: [ficus, aloe] });
      }),
    );
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("button", { name: "Ficus als gegossen eintragen" }));
    await vi.waitFor(() => expect(resultLine("Als gegossen eingetragen.")).toBeTruthy());
    expect(screen.queryByRole("button", { name: /^Rückgängig/ })).toBeNull();
    expect(announced()).toBe("Als gegossen eingetragen.");
  });

  it("US-QS-32 · F-0075 while rows remain the held row stays in its place above the other rows", async () => {
    fakeServer([ficus, aloe]);
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("button", { name: "Ficus als gegossen eintragen" }));
    const undo = await screen.findByRole("button", { name: "Rückgängig: Ficus" });
    const remaining = await screen.findByText("Aloe");
    expect(undo.compareDocumentPosition(remaining) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("US-MON-05 shows a refusal of the server and keeps the list (P-10)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url, init) =>
        init?.method === "POST"
          ? response(404, {
              error: { code: "specimen.not_found", text: "Diese Pflanze gibt es nicht." },
            })
          : response(200, { due: [ficus] }),
      ),
    );
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("button", { name: "Ficus als gegossen eintragen" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Diese Pflanze gibt es nicht.");
    expect(screen.getByText("Ficus")).toBeTruthy();
  });
});

describe("US-QS-14 issue 1697 · the watering list shows its shaped skeleton once", () => {
  it("US-QS-14 issue 1697 · a slow list shows one skeleton with its loading text, then its rows and no status", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((done) => {
      release = done;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => {
        await gate;
        return response(200, { due: [ficus] });
      }),
    );
    const { container } = show();
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toContain("Gießliste wird geladen …");
    // Three rows of blocks stand in for the rows, all decorative (DS-56).
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThanOrEqual(9);
    release();
    expect(await screen.findByText("Ficus")).toBeTruthy();
    expect(screen.queryByText("Gießliste wird geladen …")).toBeNull();
  });

  it("US-QS-14 issue 1697 · a fast list shows no loading status at all", async () => {
    fakeServer([ficus]);
    show();
    expect(await screen.findByText("Ficus")).toBeTruthy();
    expect(screen.queryByText("Gießliste wird geladen …")).toBeNull();
  });
});

describe("US-QS-32 the sheet's undo takes the day of its write and says when nothing was left", () => {
  it("US-QS-32 the undo sends the date of the write and announces the empty removal honestly", async () => {
    const undone: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url, init) => {
        const path = new URL(String(url)).pathname;
        if (path === "/watering" && init?.method === "POST")
          return response(200, { date: "2026-10-10", created: 1 });
        if (path === "/watering/unwater") {
          undone.push(String(init?.body));
          return response(200, { date: "2026-10-10", specimens: ["s1"], removed: 0 });
        }
        return response(200, { due: [ficus] });
      }),
    );
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("button", { name: "Ficus als gegossen eintragen" }));
    await user.click(await screen.findByRole("button", { name: "Rückgängig: Ficus" }));
    await vi.waitFor(() =>
      expect(announced()).toBe("Nichts mehr rückgängig zu machen – der Eintrag ist schon weg."),
    );
    expect(JSON.parse(undone[0] ?? "{}")).toMatchObject({
      specimenIds: ["s1"],
      date: "2026-10-10",
    });
  });
});

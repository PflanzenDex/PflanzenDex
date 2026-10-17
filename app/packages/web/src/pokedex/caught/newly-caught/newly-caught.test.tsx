// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CaughtSpecies } from "@pflanzendex/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NewlyCaught } from "./newly-caught";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const card = (species: string) => ({ species }) as CaughtSpecies;
const reply = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";

/** The server of the seen state: `seen` is its state (`null` = none yet); POST adds and answers the whole state. */
function fakeServer(
  initial: string[] | null,
  opts: { readFails?: boolean; postStatus?: number } = {},
) {
  let seen = initial;
  const posts: unknown[] = [];
  const fetchFn = vi.fn<typeof fetch>(async (url, init) => {
    expect(new URL(String(url)).pathname).toBe("/pokedex/seen");
    if (init?.method === "POST") {
      const sent = JSON.parse(String(init.body)) as { species: string[] };
      posts.push(sent);
      if (opts.postStatus && opts.postStatus !== 200)
        return reply(opts.postStatus, {
          error: { code: "pokedex.not_caught", text: "raw server text" },
        });
      seen = [...new Set([...(seen ?? []), ...sent.species])];
      return reply(200, { seen });
    }
    return opts.readFails
      ? reply(500, { error: { code: "system.unexpected" } })
      : reply(200, { seen });
  });
  vi.stubGlobal("fetch", fetchFn);
  return { fetchFn, posts, state: () => seen };
}

const show = (caught: CaughtSpecies[]) =>
  render(<NewlyCaught api="http://api" token={token} caught={caught} />);

describe("US-POK-12 banner for newly caught species", () => {
  it("US-POK-12 shows the species that are caught but not seen, until Okay", async () => {
    const server = fakeServer(["Aloe vera"]);
    show([card("Aloe vera"), card("Citrus limon"), card("Ficus lyrata")]);
    const banner = await screen.findByRole("status");
    expect(banner.textContent).toContain("Neu gefangen: Citrus limon, Ficus lyrata");
    expect(server.posts).toEqual([]);
  });

  it("US-POK-12 Okay writes the seen state with the shown species and removes the banner", async () => {
    const server = fakeServer(["Aloe vera"]);
    show([card("Aloe vera"), card("Citrus limon")]);
    await screen.findByRole("status");
    await userEvent.click(screen.getByRole("button", { name: "Okay" }));
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(server.posts).toEqual([{ species: ["Citrus limon"] }]);
    expect(server.state()).toEqual(["Aloe vera", "Citrus limon"]);
  });

  it("US-POK-12 first visit: creates the state silently with the current state and shows no banner", async () => {
    const server = fakeServer(null);
    show([card("Aloe vera"), card("Citrus limon")]);
    await waitFor(() => expect(server.posts).toEqual([{ species: ["Aloe vera", "Citrus limon"] }]));
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText(/Neu gefangen/)).toBeNull();
  });

  it("US-POK-12 nothing new: no banner and no write", async () => {
    const server = fakeServer(["Aloe vera"]);
    show([card("Aloe vera")]);
    await waitFor(() => expect(server.fetchFn).toHaveBeenCalled());
    expect(screen.queryByRole("status")).toBeNull();
    expect(server.posts).toEqual([]);
  });

  it("US-POK-12 a read error does not break the page and shows no banner", async () => {
    const server = fakeServer(["Aloe vera"], { readFails: true });
    const { container } = show([card("Aloe vera"), card("Citrus limon")]);
    await waitFor(() => expect(server.fetchFn).toHaveBeenCalled());
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(container.textContent).toBe("");
    expect(server.posts).toEqual([]);
  });

  it("US-POK-12 a refused Okay keeps the banner and shows the German text of the code", async () => {
    fakeServer(["Aloe vera"], { postStatus: 409 });
    show([card("Aloe vera"), card("Citrus limon")]);
    await screen.findByRole("status");
    await userEvent.click(screen.getByRole("button", { name: "Okay" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("noch nicht gefangen");
    expect(alert.textContent).not.toContain("raw server text");
    expect(screen.getByRole("button", { name: "Okay" })).toBeTruthy();
    expect(screen.getByText(/Neu gefangen: Citrus limon/)).toBeTruthy();
  });
});

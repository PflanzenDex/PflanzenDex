// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SpeciesPick } from "./species-pick";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";

function renderPick(onOwnName = vi.fn()) {
  render(
    <SpeciesPick
      api="http://api"
      token={token}
      chosen={null}
      onPick={vi.fn()}
      onOwnName={onOwnName}
    />,
  );
  return { onOwnName };
}

describe("US-QS-32 · issue 1964 the species search tells no hit from a failed search", () => {
  it("US-QS-32 · issue 1964 a search without a hit names the query and offers the own name and the catalog", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => json(200, { species: [], more: false })),
    );
    const { onOwnName } = renderPick();
    await userEvent.type(screen.getByRole("searchbox"), "Zzz");
    expect(await screen.findByText("Keine Art für „Zzz“ gefunden.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Als eigenen Wunsch übernehmen" }));
    expect(onOwnName).toHaveBeenCalledWith("Zzz");
    expect(screen.getByRole("link", { name: "Art vorschlagen" }).getAttribute("href")).toBe(
      "/discover?view=catalog&sheet=propose",
    );
  });

  it("US-QS-32 · issue 1964 while the search runs, no 'no hit' line shows yet", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    renderPick();
    await userEvent.type(screen.getByRole("searchbox"), "Zzz");
    // Longer than the 250 ms pause before the request: a pending request is not a search without hits.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(screen.queryByText(/Keine Art für/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Als eigenen Wunsch übernehmen" })).toBeNull();
  });

  it("US-QS-32 · issue 1964 a failed search says so, and 'Erneut versuchen' repeats it", async () => {
    const fetchFn = vi
      .fn()
      .mockImplementationOnce(() => json(500, {}))
      .mockImplementationOnce(() =>
        json(200, {
          species: [{ id: "sp9", latinName: "Epipremnum aureum", germanName: "Efeutute" }],
          more: false,
        }),
      );
    vi.stubGlobal("fetch", fetchFn);
    renderPick();
    await userEvent.type(screen.getByRole("searchbox"), "Epip");
    expect(await screen.findByText("Suche nicht möglich.")).toBeTruthy();
    expect(screen.queryByText(/Keine Art für/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(await screen.findByRole("button", { name: /Epipremnum aureum/ })).toBeTruthy();
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});

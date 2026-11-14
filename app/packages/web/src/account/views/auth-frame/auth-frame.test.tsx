// @vitest-environment jsdom
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AuthFrame } from "./auth-frame";
import table from "../views.de.json";

/** The rendered frame as DOM, so the tests read it the way the user sees it (structure and attributes, not the markup text). */
function renderFrame(): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = renderToString(
    <AuthFrame>
      <p>Inhalt</p>
    </AuthFrame>,
  );
  return host;
}

/** The band of the drawing and the value lines: the one region of the frame. */
function bandOf(host: HTMLElement): HTMLElement {
  const band = host.querySelector<HTMLElement>('[role="region"]');
  if (!band) throw new Error("the frame has no region");
  return band;
}

describe("auth frame value lines (US-QS-14)", () => {
  it("US-QS-14 the three value lines render on a phone too, and their list carries no hidden class (owner decision Q-156)", () => {
    const host = renderFrame();
    const lines = [...host.querySelectorAll("li")].map((li) => li.textContent);
    expect(lines).toEqual([
      "Sammle deine Pflanzen wie Karten",
      "Miss Wachstum gegen deine eigene Geschichte",
      "Tausche Stecklinge mit Freunden",
    ]);
    const list = host.querySelector("ul");
    expect(list?.classList.contains("list-none")).toBe(true);
    expect(list?.classList.contains("hidden")).toBe(false);
  });

  it("US-QS-14 the band holds the drawing and the value lines, and on a phone it is at most 36 % of the window high and scrolls inside itself (owner decision 2026-11-14)", () => {
    const band = bandOf(renderFrame());
    expect(band.querySelector("svg")).not.toBeNull();
    expect(band.querySelector("ul")).not.toBeNull();
    for (const name of ["max-h-[36dvh]", "overflow-y-auto", "overscroll-contain"]) {
      expect(band.classList.contains(name), name).toBe(true);
    }
  });

  it("US-QS-14 from md (768 px) the band has no height limit and no own scroll, as before", () => {
    const band = bandOf(renderFrame());
    for (const name of ["md:max-h-none", "md:overflow-visible", "md:justify-center"]) {
      expect(band.classList.contains(name), name).toBe(true);
    }
  });

  it("US-QS-14 the scrolling band is keyboard reachable, named by a German text from the message table and shows its focus ring inside its box", () => {
    const band = bandOf(renderFrame());
    expect(band.getAttribute("tabindex")).toBe("0");
    expect(band.getAttribute("aria-label")).toBe(table["frame.region"]);
    expect(band.getAttribute("aria-label")?.length ?? 0).toBeGreaterThan(0);
    for (const name of [
      "focus-visible:ring-inset",
      "focus-visible:ring-2",
      "focus-visible:ring-ring",
    ]) {
      expect(band.classList.contains(name), name).toBe(true);
    }
  });
});

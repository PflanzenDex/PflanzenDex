// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LetterStrip } from "./letter-strip";
import { LETTERS } from "./letter-strip.letters";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const PRESENT = new Set(["A", "E", "F", "M", "#"]);

function show(onJump = vi.fn(), present: ReadonlySet<string> = PRESENT) {
  render(
    <>
      <button type="button">davor</button>
      <LetterStrip label="Zum Buchstaben springen" present={present} onJump={onJump} />
      <button type="button">danach</button>
    </>,
  );
  return { onJump, strip: screen.getByRole("slider", { name: "Zum Buchstaben springen" }) };
}

/** The strip is 270 px high from y = 100: ten pixels per letter. */
function layoutOf(strip: HTMLElement) {
  vi.spyOn(strip, "getBoundingClientRect").mockReturnValue({ top: 100, height: 270 } as DOMRect);
}

describe("US-QS-15 · SG-LIST-11 the letter index: one control, 27 places", () => {
  it("US-QS-15 shows A to Z and '#' in a narrow strip; a letter without an entry is dimmed, not removed", () => {
    const { strip } = show();
    const labels = [...strip.children].map((el) => el.textContent);
    expect(labels).toEqual([...LETTERS]);
    const cls = (letter: string) =>
      (strip.children.item(LETTERS.indexOf(letter)) as HTMLElement).className;
    expect(cls("A")).toContain("text-primary");
    expect(cls("B")).toContain("text-muted-foreground");
    expect(cls("B")).not.toContain("invisible");
    expect(strip.className).toContain("w-11");
    expect(strip.className).toContain("touch-none");
  });

  it("US-QS-15 · US-QS-08 the strip is one slider for the keyboard and the screen reader, and its letters are hidden from them", () => {
    const { strip } = show();
    expect(strip.getAttribute("aria-orientation")).toBe("vertical");
    expect(strip.getAttribute("tabindex")).toBe("0");
    expect(strip.getAttribute("aria-valuetext")).toBe("A");
    expect(strip.getAttribute("aria-valuemin")).toBe("0");
    // Five letters have an entry: the values count those, not the 27 places.
    expect(strip.getAttribute("aria-valuemax")).toBe("4");
    for (const child of strip.children) expect(child.getAttribute("aria-hidden")).toBe("true");
    // The keyboard walk gains one stop, not 27.
    expect(document.querySelectorAll('[tabindex="0"], button, a[href]')).toHaveLength(3);
  });

  it("US-QS-15 · US-QS-08 the arrow keys step through the letters that have an entry and jump the list; Home and End go to the ends", async () => {
    const { strip, onJump } = show();
    await userEvent.tab();
    await userEvent.tab();
    expect(document.activeElement).toBe(strip);
    await userEvent.keyboard("{ArrowDown}");
    expect(onJump).toHaveBeenLastCalledWith("E");
    expect(strip.getAttribute("aria-valuetext")).toBe("E");
    expect(strip.getAttribute("aria-valuenow")).toBe("1");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    expect(onJump).toHaveBeenLastCalledWith("M");
    await userEvent.keyboard("{ArrowUp}");
    expect(onJump).toHaveBeenLastCalledWith("F");
    await userEvent.keyboard("{End}");
    expect(onJump).toHaveBeenLastCalledWith("#");
    await userEvent.keyboard("{ArrowDown}");
    expect(onJump).toHaveBeenLastCalledWith("#");
    await userEvent.keyboard("{Home}");
    expect(onJump).toHaveBeenLastCalledWith("A");
    await userEvent.keyboard("{ArrowUp}");
    expect(onJump).toHaveBeenLastCalledWith("A");
    // The next control is one Tab away: the strip is no trap.
    await userEvent.tab();
    expect(document.activeElement?.textContent).toBe("danach");
  });

  it("US-QS-15 another key does nothing: the keys of the page keep their meaning", async () => {
    const { strip, onJump } = show();
    strip.focus();
    await userEvent.keyboard("{ArrowRight}x{PageDown}");
    expect(onJump).not.toHaveBeenCalled();
  });

  it("US-QS-15 a tap or a drag jumps to the letter under the finger; the letter shows large while the finger is down", () => {
    const { strip, onJump } = show();
    layoutOf(strip);
    // y = 100 + 10 * 4.5 is the place of E (index 4); the finger moves down to M (index 12), then lifts.
    fireEvent.pointerDown(strip, { clientY: 145, pointerId: 1 });
    expect(onJump).toHaveBeenLastCalledWith("E");
    const bubble = () => document.querySelector("[data-letter-bubble]");
    expect(bubble()?.textContent).toBe("E");
    expect(bubble()?.getAttribute("aria-hidden")).toBe("true");
    fireEvent.pointerMove(strip, { clientY: 225, pointerId: 1 });
    expect(onJump).toHaveBeenLastCalledWith("M");
    expect(bubble()?.textContent).toBe("M");
    fireEvent.pointerUp(strip, { pointerId: 1 });
    expect(bubble()).toBeNull();
    // A move without a finger down jumps nowhere.
    onJump.mockClear();
    fireEvent.pointerMove(strip, { clientY: 300, pointerId: 1 });
    expect(onJump).not.toHaveBeenCalled();
    expect(strip.getAttribute("aria-valuetext")).toBe("M");
  });

  it("US-QS-15 a touch on a letter without an entry goes on to the next letter that has one", () => {
    const { strip, onJump } = show();
    layoutOf(strip);
    // G is index 6: the next letter with an entry is M.
    fireEvent.pointerDown(strip, { clientY: 165, pointerId: 1 });
    expect(onJump).toHaveBeenLastCalledWith("M");
    fireEvent.pointerCancel(strip, { pointerId: 1 });
    expect(document.querySelector("[data-letter-bubble]")).toBeNull();
  });

  it("US-QS-15 a strip without any letter jumps nowhere and shows no bubble", () => {
    const { strip, onJump } = show(vi.fn(), new Set());
    layoutOf(strip);
    fireEvent.pointerDown(strip, { clientY: 150, pointerId: 1 });
    expect(onJump).not.toHaveBeenCalled();
    expect(document.querySelector("[data-letter-bubble]")).toBeNull();
    expect(strip.getAttribute("aria-valuetext")).toBe("");
  });

  it("US-QS-15 without a measurable strip a touch jumps nowhere", () => {
    const { strip, onJump } = show();
    fireEvent.pointerDown(strip, { clientY: 150, pointerId: 1 });
    expect(onJump).not.toHaveBeenCalled();
  });
});

describe("US-QS-15 · WCAG 1.4.4 the labels thin out where the strip is too short for 27 letters (200 % text)", () => {
  /** The letters are 12 px high; the strip is `room` px high. */
  function stubBoxes(room: number) {
    const observers: (() => void)[] = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(private readonly callback: () => void) {
          observers.push(callback);
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.hasAttribute("data-letter-index") ? room : 0;
    });
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      () => ({ top: 0, height: 12 }) as DOMRect,
    );
    return observers;
  }

  const visible = (strip: HTMLElement) =>
    [...strip.children]
      .filter((el) => !el.className.includes("invisible"))
      .map((el) => el.textContent);

  it("US-QS-15 every letter shows while 27 of them fit, every other letter when 14 fit, and the places stay", () => {
    const observers = stubBoxes(400);
    const { strip } = show();
    expect(visible(strip)).toHaveLength(27);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.hasAttribute("data-letter-index") ? 200 : 0;
    });
    act(() => observers.forEach((callback) => callback()));
    // 27 * 12 = 324 px do not fit 200 px: every second label stays, the 27 places stay for the finger.
    expect(visible(strip)).toEqual(LETTERS.filter((_, i) => i % 2 === 0));
    expect(strip.children).toHaveLength(27);
  });

  it("US-QS-15 the 27 places share the height of the strip, so the whole strip stays reachable at 200 % text", () => {
    const { strip } = show();
    for (const place of strip.children) {
      expect(place.className).toContain("flex-1");
      expect(place.className).not.toMatch(/(^|\s)h-\d/);
    }
    expect(strip.className).not.toContain("py-1");
  });

  it("US-QS-15 without a ResizeObserver or a height every letter shows", () => {
    const { strip } = show();
    expect(visible(strip)).toHaveLength(27);
  });
});

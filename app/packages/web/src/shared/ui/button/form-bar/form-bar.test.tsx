// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FormBar } from "./form-bar";

afterEach(cleanup);

/** The names of the buttons in document order. */
const order = () => screen.getAllByRole("button").map((b) => b.textContent);

describe("US-QS-32 · SG-SHEET-04 the form bar: Abbrechen leading, the confirming action trailing", () => {
  it("US-QS-32 · SG-SHEET-04 Abbrechen comes first and the confirming action after it", () => {
    render(
      <FormBar formId="f" onCancel={() => undefined}>
        Sichern
      </FormBar>,
    );
    expect(order()).toEqual(["Abbrechen", "Sichern"]);
  });

  it("US-QS-32 · SG-SHEET-04 the confirming button submits the form it names, although the form sits elsewhere in the DOM", async () => {
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    render(
      <>
        <FormBar formId="away" onCancel={() => undefined}>
          Sichern
        </FormBar>
        <div>
          <form id="away" onSubmit={onSubmit}>
            <input aria-label="Name" />
          </form>
        </div>
      </>,
    );
    const save = screen.getByRole("button", { name: "Sichern" });
    expect(save.getAttribute("form")).toBe("away");
    expect((save as HTMLButtonElement).type).toBe("submit");
    await userEvent.click(save);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("US-QS-32 · SG-SHEET-04 a confirming action without a form calls onConfirm", async () => {
    const onConfirm = vi.fn();
    render(
      <FormBar onConfirm={onConfirm} onCancel={() => undefined}>
        Weiter
      </FormBar>,
    );
    const next = screen.getByRole("button", { name: "Weiter" });
    expect((next as HTMLButtonElement).type).toBe("button");
    await userEvent.click(next);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("US-QS-32 · SG-SHEET-04 Abbrechen is a plain button that calls the way out it was given", async () => {
    const onCancel = vi.fn();
    render(
      <FormBar formId="f" onCancel={onCancel}>
        Sichern
      </FormBar>,
    );
    const cancel = screen.getByRole("button", { name: "Abbrechen" });
    expect((cancel as HTMLButtonElement).type).toBe("button");
    expect(cancel.hasAttribute("data-close")).toBe(true);
    await userEvent.click(cancel);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("US-QS-32 · SG-SHEET-04 a bar without a way out shows the confirming action alone", () => {
    render(<FormBar formId="f">Sichern</FormBar>);
    expect(order()).toEqual(["Sichern"]);
  });

  it("US-QS-32 · SG-SHEET-04 the confirming action is the filled default button, Abbrechen the plain one", () => {
    render(
      <FormBar formId="f" onCancel={() => undefined}>
        Sichern
      </FormBar>,
    );
    const save = screen.getByRole("button", { name: "Sichern" }).className.split(/\s+/);
    expect(save).toContain("bg-primary");
    expect(save).not.toContain("bg-background");
    const cancel = screen.getByRole("button", { name: "Abbrechen" }).className.split(/\s+/);
    expect(cancel).toContain("text-primary");
    expect(cancel).not.toContain("bg-primary");
  });

  it("US-QS-32 · SG-TOUCH-01 both buttons keep a 44 px hit area and wrap as a row, so 200 % text puts the action below Abbrechen", () => {
    render(
      <FormBar formId="f" onCancel={() => undefined}>
        Messung sichern
      </FormBar>,
    );
    for (const name of ["Abbrechen", "Messung sichern"]) {
      expect(screen.getByRole("button", { name }).className).toContain("min-h-[44px]");
    }
    const bar = screen.getByRole("button", { name: "Abbrechen" }).parentElement as HTMLElement;
    expect(bar.className.split(/\s+/)).toContain("flex-wrap");
  });

  it("US-QS-32 · SG-SHEET-04 a pending action shows its pending text, is disabled and cannot be pressed twice", async () => {
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    render(
      <>
        <form id="f" onSubmit={onSubmit} />
        <FormBar formId="f" pending pendingText="Speichert …" onCancel={() => undefined}>
          Sichern
        </FormBar>
      </>,
    );
    const busy = screen.getByRole("button", { name: "Speichert …" });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    expect(busy.getAttribute("aria-busy")).toBe("true");
    await userEvent.click(busy);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("US-QS-32 · SG-SHEET-04 a disabled action is disabled, an inactive one keeps its focus (aria-disabled)", () => {
    const { rerender } = render(
      <FormBar formId="f" disabled onCancel={() => undefined}>
        Sichern
      </FormBar>,
    );
    expect((screen.getByRole("button", { name: "Sichern" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    rerender(
      <FormBar formId="f" inactive onCancel={() => undefined}>
        Sichern
      </FormBar>,
    );
    const inactive = screen.getByRole("button", { name: "Sichern" }) as HTMLButtonElement;
    expect(inactive.disabled).toBe(false);
    expect(inactive.getAttribute("aria-disabled")).toBe("true");
  });

  it("US-QS-32 · SG-SHEET-04 the confirming action takes its own accessible name and the destructive look", () => {
    render(
      <FormBar formId="f" confirmName="Sichern: Echte Aloe" destructive>
        Sichern
      </FormBar>,
    );
    const save = screen.getByRole("button", { name: "Sichern: Echte Aloe" });
    expect(save.className.split(/\s+/)).toContain("bg-destructive");
  });
});

/** A visual viewport that a test moves, as a phone does when its keyboard opens (SG-FORM-02). */
function mockVisualViewport(start: { height: number; offsetTop: number }) {
  const target = new EventTarget();
  const viewport = Object.assign(target, { ...start, width: 360, offsetLeft: 0, scale: 1 });
  Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
  return {
    move(next: { height: number; offsetTop: number }) {
      Object.assign(viewport, next);
      act(() => {
        viewport.dispatchEvent(new Event("resize"));
        viewport.dispatchEvent(new Event("scroll"));
      });
    },
  };
}

describe("US-QS-32 · SG-FORM-02 a form bar on a page follows the visual viewport", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "visualViewport");
  });

  const BAR = 56;

  it("US-QS-32 · SG-FORM-02 the page bar is sticky at the top of its form and stays inside the visual viewport while the keyboard opens", () => {
    const keyboard = mockVisualViewport({ height: 716, offsetTop: 0 });
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(BAR);
    render(
      <FormBar formId="f" onCancel={() => undefined}>
        Sichern
      </FormBar>,
    );
    const bar = screen.getByRole("button", { name: "Sichern" }).parentElement as HTMLElement;
    expect(bar.className.split(/\s+/)).toContain("sticky");
    const inside = (viewport: { height: number; offsetTop: number }) => {
      const top = parseFloat(bar.style.top);
      return top >= viewport.offsetTop && top + BAR <= viewport.offsetTop + viewport.height;
    };
    expect(inside({ height: 716, offsetTop: 0 })).toBe(true);
    // The keyboard takes the lower half and the browser pans the visual viewport to the focused field.
    for (const shrunk of [
      { height: 354, offsetTop: 0 },
      { height: 354, offsetTop: 120 },
      { height: 354, offsetTop: 362 },
    ]) {
      keyboard.move(shrunk);
      expect(
        inside(shrunk),
        `the bar leaves the visual viewport at ${JSON.stringify(shrunk)}`,
      ).toBe(true);
    }
    keyboard.move({ height: 716, offsetTop: 0 });
    expect(inside({ height: 716, offsetTop: 0 })).toBe(true);
  });

  it("US-QS-32 · SG-FORM-02 a field the keyboard brings up scrolls clear of the bar: the page publishes the bar's height", () => {
    mockVisualViewport({ height: 716, offsetTop: 0 });
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(BAR);
    const { unmount } = render(
      <FormBar formId="f" onCancel={() => undefined}>
        Sichern
      </FormBar>,
    );
    expect(document.documentElement.style.getPropertyValue("--form-bar-height")).toBe(`${BAR}px`);
    unmount();
    expect(document.documentElement.style.getPropertyValue("--form-bar-height")).toBe("");
  });
});

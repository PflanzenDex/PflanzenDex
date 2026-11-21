// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { FormBar } from "./form-bar";
import { FormBarRegion } from "./form-bar.page";

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

/**
 * A page form as "Messen" is (US-QS-32, SG-SHEET-04): its content in a `FormBarRegion`, the bar after the last field. The
 * region gives the bar its place at the top of the form below `md`.
 */
function PageForm(props: { status?: string | null }) {
  return (
    <form id="page-form" aria-label="Messung erfassen">
      <FormBarRegion>
        <label>
          Messwert
          <input />
        </label>
        <label>
          Notiz
          <input />
        </label>
        <FormBar
          formId="page-form"
          onCancel={() => undefined}
          {...(props.status !== undefined ? { status: props.status } : {})}
        >
          Sichern
        </FormBar>
      </FormBarRegion>
    </form>
  );
}

const follows = (a: Element, b: Element) =>
  (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

describe("US-QS-32 · SG-SHEET-04 a page form: the bar at the top below md, a plain row after the last field from md", () => {
  it("US-QS-32 · SG-SHEET-04 below md the bar sticks at the top of the form, before its first field, and the DOM order is the visual order", () => {
    setViewportWidth(360);
    render(<PageForm />);
    const cancel = screen.getByRole("button", { name: "Abbrechen" });
    const save = screen.getByRole("button", { name: "Sichern" });
    const bar = save.parentElement as HTMLElement;
    expect(bar.className.split(/\s+/)).toContain("sticky");
    expect(bar.hasAttribute("data-form-bar")).toBe(true);
    expect(follows(cancel, save)).toBe(true);
    expect(follows(bar, screen.getByLabelText("Messwert"))).toBe(true);
    expect(order()).toEqual(["Abbrechen", "Sichern"]);
  });

  it.each([768, 1024, 1440])(
    "US-QS-32 · SG-SHEET-04 at %i px the pair is a plain row after the last field of the page form, not sticky",
    (width) => {
      setViewportWidth(width);
      render(<PageForm />);
      const cancel = screen.getByRole("button", { name: "Abbrechen" });
      const save = screen.getByRole("button", { name: "Sichern" });
      const bar = save.parentElement as HTMLElement;
      expect(bar.className).not.toMatch(/\b(sticky|fixed)\b/);
      expect(bar.style.top).toBe("");
      expect(follows(cancel, save)).toBe(true);
      expect(follows(screen.getByLabelText("Notiz"), bar)).toBe(true);
      expect(order()).toEqual(["Abbrechen", "Sichern"]);
    },
  );

  it("US-QS-32 · SG-SHEET-04 only one pair is in the page at a time: crossing md moves it, and the typed input stays", async () => {
    setViewportWidth(360);
    render(<PageForm />);
    await userEvent.type(screen.getByLabelText("Messwert"), "12,5");
    act(() => setViewportWidth(1024));
    expect(screen.getAllByRole("button", { name: "Abbrechen" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Sichern" })).toHaveLength(1);
    const bar = screen.getByRole("button", { name: "Sichern" }).parentElement as HTMLElement;
    expect(follows(screen.getByLabelText("Notiz"), bar)).toBe(true);
    expect((screen.getByLabelText("Messwert") as HTMLInputElement).value).toBe("12,5");
    act(() => setViewportWidth(360));
    expect(screen.getAllByRole("button", { name: "Sichern" })).toHaveLength(1);
    // Back below md the pair is at the top again, before the first field.
    expect(
      follows(screen.getByRole("button", { name: "Sichern" }), screen.getByLabelText("Messwert")),
    ).toBe(true);
    expect((screen.getByLabelText("Messwert") as HTMLInputElement).value).toBe("12,5");
  });

  it("US-QS-32 · SG-SHEET-04 below md the status line of the action stands right under the sticky bar, before the first field", () => {
    setViewportWidth(360);
    render(<PageForm status="Foto wird gespeichert …" />);
    const bar = screen.getByRole("button", { name: "Sichern" }).parentElement as HTMLElement;
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("Foto wird gespeichert …");
    expect(follows(bar, status)).toBe(true);
    expect(follows(status, screen.getByLabelText("Messwert"))).toBe(true);
    expect(bar.nextElementSibling).toBe(status);
  });

  it.each([768, 1280])(
    "US-QS-32 · SG-SHEET-04 at %i px the status line of the action stands right after the row at the end of the form",
    (width) => {
      setViewportWidth(width);
      render(<PageForm status="Foto wird gespeichert …" />);
      const bar = screen.getByRole("button", { name: "Sichern" }).parentElement as HTMLElement;
      const status = screen.getByRole("status");
      expect(bar.nextElementSibling).toBe(status);
      expect(follows(screen.getByLabelText("Notiz"), status)).toBe(true);
    },
  );

  it("US-QS-32 · US-WAC-06 the status line is there before its text, so a status that appears is announced, and takes no room while empty; without a status prop there is none", () => {
    setViewportWidth(360);
    const { rerender } = render(<PageForm status={null} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("");
    expect(status.className.split(/\s+/)).toContain("empty:hidden");
    rerender(<PageForm status="Foto gespeichert." />);
    expect(screen.getByRole("status")).toBe(status);
    expect(status.textContent).toBe("Foto gespeichert.");
    rerender(<PageForm />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("US-QS-32 · SG-SHEET-04 a form without a region keeps the pair as a plain row after its fields at every width", () => {
    for (const width of [360, 1024]) {
      setViewportWidth(width);
      const { unmount } = render(
        <form id="plain" aria-label="Formular">
          <input aria-label="Name" />
          <FormBar formId="plain" onCancel={() => undefined}>
            Sichern
          </FormBar>
        </form>,
      );
      const bar = screen.getByRole("button", { name: "Sichern" }).parentElement as HTMLElement;
      expect(bar.className).not.toMatch(/\b(sticky|fixed)\b/);
      expect(follows(screen.getByLabelText("Name"), bar)).toBe(true);
      unmount();
    }
  });
});

describe("US-QS-32 · SG-FORM-02 a form bar on a page follows the visual viewport below md", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "visualViewport");
  });

  const BAR = 56;

  it("US-QS-32 · SG-FORM-02 the page bar is sticky at the top of its form and stays inside the visual viewport while the keyboard opens", () => {
    const keyboard = mockVisualViewport({ height: 716, offsetTop: 0 });
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(BAR);
    setViewportWidth(360);
    render(<PageForm />);
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
    setViewportWidth(360);
    const { unmount } = render(<PageForm />);
    expect(document.documentElement.style.getPropertyValue("--form-bar-height")).toBe(`${BAR}px`);
    unmount();
    expect(document.documentElement.style.getPropertyValue("--form-bar-height")).toBe("");
  });
});

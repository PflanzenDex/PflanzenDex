// @vitest-environment jsdom
import { useContext } from "react";
import { createPortal } from "react-dom";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SpecimenCard } from "@pflanzendex/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "@/shared/ui/button";
import { ResultHost } from "../../plant-layer.slot";
import { MeasureButton, QuickActions } from "./quick-actions";

const CARD = { id: "e1", name: "Birkenfeige" } as SpecimenCard;

afterEach(cleanup);

/** The slot "Gießen" of the monitoring module: a tinted button, and its result drawn into the host under the row (issue 2536). */
function Water() {
  const host = useContext(ResultHost);
  return (
    <>
      <Button type="button" variant="tinted">
        Gießen
      </Button>
      {host ? createPortal(<p>Zuletzt gegossen: heute</p>, host) : null}
    </>
  );
}

const row = () => screen.getByRole("group", { name: "Schnellaktionen" });
const classes = (el: Element) => el.className.split(/\s+/);

describe("US-QS-23 · SG-BTN-01 · SG-BTN-02 the quick actions of a plant: Messen filled, Gießen and Foto tinted (owner decision 2026-11-22, issue 2424)", () => {
  it("US-QS-23 · issue 2424 the row holds Messen, Gießen and Foto in this order, one named group", () => {
    render(<QuickActions card={CARD} onMeasure={vi.fn()} onPhoto={vi.fn()} water={<Water />} />);
    expect(
      within(row())
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Messen", "Gießen", "Foto"]);
  });

  it("US-QS-23 · SG-BTN-02 only Messen is filled; Gießen and Foto are tinted, so the layer shows one filled button", () => {
    render(<QuickActions card={CARD} onMeasure={vi.fn()} onPhoto={vi.fn()} water={<Water />} />);
    expect(classes(screen.getByRole("button", { name: "Messen: Birkenfeige" }))).toContain(
      "bg-primary",
    );
    for (const name of ["Gießen", "Foto: Birkenfeige"]) {
      const classNames = classes(screen.getByRole("button", { name }));
      expect(classNames, name).toContain("bg-accent");
      expect(classNames, name).not.toContain("bg-primary");
    }
    expect(
      screen.getAllByRole("button").filter((button) => classes(button).includes("bg-primary")),
    ).toHaveLength(1);
  });

  it("NFR-13 · SG-TOUCH-01 the row wraps and the buttons share it, so at 200 % text a button moves to the next row and keeps 44 px", () => {
    render(<QuickActions card={CARD} onMeasure={vi.fn()} onPhoto={vi.fn()} water={<Water />} />);
    expect(classes(row())).toEqual(
      expect.arrayContaining(["flex", "flex-wrap", "[&>button]:grow", "[&>button]:basis-1/4"]),
    );
    for (const button of within(row()).getAllByRole("button")) {
      expect(classes(button), button.textContent ?? "").toContain("min-h-[44px]");
    }
  });

  it("US-QS-23 Messen and Foto name their plant, and Messen and Foto call their own handler", async () => {
    const onMeasure = vi.fn();
    const onPhoto = vi.fn();
    render(<QuickActions card={CARD} onMeasure={onMeasure} onPhoto={onPhoto} />);
    await userEvent.click(screen.getByRole("button", { name: "Foto: Birkenfeige" }));
    expect(onPhoto).toHaveBeenCalledOnce();
    expect(onMeasure).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Messen: Birkenfeige" }));
    expect(onMeasure).toHaveBeenCalledOnce();
  });

  it("US-QS-23 a layer that cannot measure has no Messen and no Foto, and keeps Gießen", () => {
    render(<QuickActions card={CARD} water={<Water />} />);
    expect(screen.queryByRole("button", { name: /^Messen/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Foto/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Gießen" })).toBeTruthy();
  });

  it("US-QS-15 · issue 2536 the result of Gießen is drawn into a line directly below the row, not into the row", () => {
    render(<QuickActions card={CARD} onMeasure={vi.fn()} water={<Water />} />);
    const result = screen.getByText("Zuletzt gegossen: heute");
    const host = result.parentElement as HTMLElement;
    expect(row().nextElementSibling).toBe(host);
    expect(row().contains(host)).toBe(false);
    expect(row().querySelector("p")).toBeNull();
    expect(host.textContent).toBe("Zuletzt gegossen: heute");
  });

  it("US-QS-15 · SG-FEED-05 · issue 2536 without a result the line is empty and hidden, so the row is the one of before and takes no gap", () => {
    const { container } = render(<QuickActions card={CARD} onMeasure={vi.fn()} />);
    const host = row().nextElementSibling as HTMLElement;
    expect(host.tagName).toBe("DIV");
    expect(host.childNodes).toHaveLength(0);
    expect(classes(host)).toContain("empty:hidden");
    // The host is the only thing under the row, and the quick actions are one column (the gap lies between shown items).
    expect(container.firstElementChild?.children).toHaveLength(2);
  });

  it("US-QS-15 · issue 2536 the calm note of the first plant stands under the line of the result, and the line under the row", () => {
    render(
      <QuickActions
        card={CARD}
        onMeasure={vi.fn()}
        water={<Water />}
        note={<p role="note">Miss deine Pflanze.</p>}
      />,
    );
    const host = screen.getByText("Zuletzt gegossen: heute").parentElement as HTMLElement;
    expect(row().nextElementSibling).toBe(host);
    expect(host.nextElementSibling).toBe(screen.getByRole("note"));
  });

  it("US-QS-15 · issue 2536 the host is no live region: the shared live region says the result, the line only shows it", () => {
    render(<QuickActions card={CARD} onMeasure={vi.fn()} water={<Water />} />);
    const host = screen.getByText("Zuletzt gegossen: heute").parentElement as HTMLElement;
    expect(host.closest("[aria-live], [role=status], [role=alert]")).toBeNull();
  });

  it("US-ONB-07 the calm note of the first plant stands under the row when there is no result", () => {
    render(
      <QuickActions
        card={CARD}
        onMeasure={vi.fn()}
        note={<p role="note">Miss deine Pflanze.</p>}
      />,
    );
    const note = screen.getByRole("note");
    expect(row().nextElementSibling?.nextElementSibling).toBe(note);
  });

  it("US-QS-23 the measure button names its plant", () => {
    render(<MeasureButton card={CARD} onMeasure={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Messen: Birkenfeige" }).textContent).toBe("Messen");
  });
});

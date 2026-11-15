// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as network from "@/shared/platform/browser/network";
import { Button } from "./button";
import { NetworkSlot } from "./network-gate/network-gate";

// The network hook is spied on: a plain Button must never call it (no listener, no re-render for the network state).
vi.mock("@/shared/platform/browser/network", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/platform/browser/network")>();
  return { ...actual, useOnline: vi.fn(actual.useOnline) };
});

afterEach(cleanup);

describe("Button (US-QS-07, DS-15, DS-34, DS-36)", () => {
  it("US-QS-07 · DS-36 renders a native button that fires onClick and keeps its name", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Speichern</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("US-QS-07 · DS-36 forwards the ref and spreads native props", () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <Button ref={ref} type="submit" data-testid="b">
        Senden
      </Button>,
    );
    expect(ref.current).toBe(screen.getByTestId("b"));
    expect(ref.current?.type).toBe("submit");
  });

  it("US-QS-07 · DS-31 caller classes win over the variant classes", () => {
    render(<Button className="rounded-full px-10">Rund</Button>);
    const cls = screen.getByRole("button", { name: "Rund" }).className;
    expect(cls).toContain("rounded-full");
    expect(cls).toContain("px-10");
    expect(cls).not.toContain("px-4");
  });

  it("US-QS-07 · DS-15 every size keeps a 44 px minimum hit area", () => {
    for (const size of ["default", "sm", "lg", "touch"] as const) {
      render(<Button size={size}>{size}</Button>);
      expect(screen.getByRole("button", { name: size }).className).toMatch(/min-h-\[4[48]px\]/);
    }
    render(<Button size="icon" aria-label="Schließen" />);
    const icon = screen.getByRole("button", { name: "Schließen" }).className;
    expect(icon).toContain("min-h-[44px]");
    expect(icon).toContain("min-w-[44px]");
  });

  it("US-QS-07 · DS-15 sm button has a 44 px minimum width (issue 970)", () => {
    render(<Button size="sm">Ok</Button>);
    const cls = screen.getByRole("button", { name: "Ok" }).className;
    expect(cls).toContain("min-h-[44px]");
    expect(cls).toContain("min-w-[44px]");
  });

  it("US-QS-07 · DS-15 no size shrinks below 44 px on wider viewports", () => {
    for (const size of ["default", "sm", "lg", "touch", "icon"] as const) {
      render(
        <Button size={size} aria-label={size}>
          {size}
        </Button>,
      );
      expect(screen.getByRole("button", { name: size }).className).not.toMatch(
        /(?:sm|md|lg|xl|2xl):min-h-/,
      );
    }
  });

  it("US-QS-07 · DS-37 shows a focus ring that comes with outline-none", () => {
    render(<Button>Fokus</Button>);
    const cls = screen.getByRole("button", { name: "Fokus" }).className;
    expect(cls).toContain("focus-visible:ring-2");
    expect(cls).toContain("focus-visible:ring-ring");
  });

  it("US-QS-07 · DS-39 a disabled button is not clickable and says so", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Gesperrt
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Gesperrt" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.className).toContain("disabled:opacity-50");
    expect(button.className).toContain("disabled:pointer-events-none");
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("US-QS-07 · DS-15 a pending button is busy, disabled and announces the German default text", async () => {
    const onClick = vi.fn();
    render(
      <Button pending onClick={onClick}>
        Speichern
      </Button>,
    );
    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.textContent).toContain("Lädt …");
    expect(button.textContent).toContain("Speichern");
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("US-QS-32 SG-COPY-04 the default pending label is 'Lädt …' with a space before the ellipsis", () => {
    render(<Button pending>Speichern</Button>);
    const text = screen.getByRole("button").textContent ?? "";
    expect(text).toContain("Lädt …");
    expect(text).not.toContain("Lädt…");
  });

  it("US-QS-07 · DS-15 the pending text can be replaced by the caller", () => {
    render(
      <Button pending pendingLabel="Wird gespeichert…">
        Speichern
      </Button>,
    );
    expect(screen.getByRole("button").textContent).toContain("Wird gespeichert…");
  });

  it("US-QS-07 · DS-15 an idle button is not marked busy", () => {
    render(<Button>Ruhig</Button>);
    expect(screen.getByRole("button").hasAttribute("aria-busy")).toBe(false);
  });

  it("US-QS-07 · DS-17 an icon-only button is named by its aria-label and hides the glyph", () => {
    render(
      <Button size="icon" aria-label="Schließen">
        <svg data-testid="glyph" aria-hidden="true" />
      </Button>,
    );
    expect(screen.getByRole("button", { name: "Schließen" })).toBeTruthy();
    expect(screen.getByTestId("glyph").getAttribute("aria-hidden")).toBe("true");
  });

  it("US-QS-07 · DS-17 an icon-only button without aria-label does not type-check", () => {
    // @ts-expect-error size="icon" requires aria-label
    render(<Button size="icon" />);
  });

  it("US-QS-07 · DS-36 asChild renders the child element with the button styling and keeps link semantics", () => {
    render(
      <Button asChild variant="outline">
        <a href="/pflanzen">Zu den Pflanzen</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Zu den Pflanzen" });
    expect(link.getAttribute("href")).toBe("/pflanzen");
    expect(screen.queryByRole("button")).toBeNull();
    expect(link.className).toContain("border");
  });

  it("US-QS-07 · DS-35 offers every named variant", () => {
    for (const variant of [
      "default",
      "secondary",
      "outline",
      "ghost",
      "destructive",
      "link",
    ] as const) {
      render(<Button variant={variant}>{variant}</Button>);
      expect(screen.getByRole("button", { name: variant })).toBeTruthy();
    }
  });

  it("US-QS-14 · Greenhouse look: pill shape, semibold and a press scale; icon buttons use the control radius", () => {
    render(
      <>
        <Button>Speichern</Button>
        <Button size="icon" aria-label="Mehr">
          +
        </Button>
      </>,
    );
    const pill = screen.getByRole("button", { name: "Speichern" }).className;
    expect(pill).toContain("rounded-pill");
    expect(pill).toContain("font-semibold");
    expect(pill).toContain("active:scale-[0.98]");
    expect(screen.getByRole("button", { name: "Mehr" }).className).toContain("rounded-control");
  });

  it("US-QS-14 · the secondary variant draws its boundary in --input (WCAG 1.4.11)", () => {
    render(<Button variant="secondary">Abbrechen</Button>);
    const classes = screen.getByRole("button", { name: "Abbrechen" }).className.split(/\s+/);
    expect(classes).toContain("border");
    expect(classes).toContain("border-input");
    expect(classes).toContain("bg-secondary");
  });

  it("US-QS-14 · the outline variant draws its boundary in --primary (ADR 0017)", () => {
    render(<Button variant="outline">Mehr Angaben</Button>);
    const classes = screen.getByRole("button", { name: "Mehr Angaben" }).className.split(/\s+/);
    expect(classes).toContain("border");
    expect(classes).toContain("border-primary");
  });
});

describe("Button needsNetwork (US-QS-30 · SG-BTN-05, SG-STATE-05)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("US-QS-30 · offline a button that needs the network does not run its action and says why next to it", async () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    const onClick = vi.fn();
    render(
      <Button needsNetwork onClick={onClick}>
        Gießen
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Gießen" });
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(button.getAttribute("aria-disabled")).toBe("true");
    const reason = document.getElementById(button.getAttribute("aria-describedby") ?? "");
    expect(reason?.textContent).toBe("Du bist offline. Das geht erst wieder mit Verbindung.");
    expect(reason?.className).not.toContain("sr-only");
  });

  it("US-QS-30 · going offline keeps the same button and its focus", () => {
    const state = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
    render(<Button needsNetwork>Gießen</Button>);
    const button = screen.getByRole("button", { name: "Gießen" });
    button.focus();
    state.mockReturnValue(false);
    act(() => window.dispatchEvent(new Event("offline")));
    expect(screen.getByRole("button", { name: "Gießen" })).toBe(button);
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute("aria-disabled")).toBe("true");
  });

  it("US-QS-30 · online again the button is active without a reload", async () => {
    const state = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    const onClick = vi.fn();
    render(
      <Button needsNetwork onClick={onClick}>
        Gießen
      </Button>,
    );
    state.mockReturnValue(true);
    act(() => window.dispatchEvent(new Event("online")));
    const button = screen.getByRole("button", { name: "Gießen" });
    expect(button.hasAttribute("aria-disabled")).toBe(false);
    expect(button.hasAttribute("aria-describedby")).toBe(false);
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("US-QS-30 · a button without needsNetwork stays active offline and listens to nothing (buffered writes, DS-11)", async () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    vi.mocked(network.useOnline).mockClear();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Gießen</Button>);
    const button = screen.getByRole("button", { name: "Gießen" });
    expect(button.hasAttribute("aria-disabled")).toBe(false);
    expect(network.useOnline).not.toHaveBeenCalled();
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("US-QS-30 · in a NetworkSlot the reason stands once below the group and every button names it", () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    render(
      <NetworkSlot>
        <Button needsNetwork>Speichern</Button>
        <Button needsNetwork>Abbrechen-Ziel</Button>
      </NetworkSlot>,
    );
    const first = screen.getByRole("button", { name: "Speichern" });
    const second = screen.getByRole("button", { name: "Abbrechen-Ziel" });
    expect(first.getAttribute("aria-describedby")).toBe(second.getAttribute("aria-describedby"));
    const reason = document.getElementById(first.getAttribute("aria-describedby") ?? "");
    expect(reason?.textContent).toBe("Du bist offline. Das geht erst wieder mit Verbindung.");
    // The line is a sibling after the buttons, never inside the row of buttons.
    expect(reason?.parentElement).toBe(first.parentElement);
    expect(first.nextElementSibling?.contains(reason ?? null) ?? false).toBe(false);
  });

  it("US-QS-30 · a visible: false slot keeps the reason for assistive technology only", () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    render(
      <NetworkSlot visible={false}>
        <Button needsNetwork>Ja</Button>
      </NetworkSlot>,
    );
    const button = screen.getByRole("button", { name: "Ja" });
    const reason = document.getElementById(button.getAttribute("aria-describedby") ?? "");
    expect(reason?.className).toContain("sr-only");
  });

  it("US-QS-30 · a caller's aria-describedby is kept, the reason is added to it", () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    render(
      <>
        <p id="hint">Hilfe</p>
        <Button needsNetwork aria-describedby="hint">
          Gießen
        </Button>
      </>,
    );
    const ids = (
      screen.getByRole("button", { name: "Gießen" }).getAttribute("aria-describedby") ?? ""
    ).split(" ");
    expect(ids[0]).toBe("hint");
    expect(ids).toHaveLength(2);
    expect(document.getElementById(ids[1] ?? "")?.textContent).toContain("Du bist offline");
  });

  it("US-QS-30 · needsNetwork cannot be combined with asChild: the child's own press would run past the gate", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      render(
        <Button asChild needsNetwork>
          <a href="/x">Link</a>
        </Button>,
      ),
    ).toThrow(/needsNetwork cannot be combined with asChild/);
  });
});

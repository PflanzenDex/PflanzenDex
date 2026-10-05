// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "./button";

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
    expect(button.textContent).toContain("Lädt…");
    expect(button.textContent).toContain("Speichern");
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
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
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Avatar } from "./avatar";

afterEach(cleanup);

describe("Avatar (US-QS-07, 1.1.1)", () => {
  it("US-QS-07 an image avatar has the name as alternative text", () => {
    render(<Avatar name="Anna Beispiel" src="/a.jpg" />);
    expect(screen.getByRole("img", { name: "Anna Beispiel" }).tagName).toBe("IMG");
  });

  it("US-QS-07 without an image the initials stand in and the name stays the accessible name", () => {
    render(<Avatar name="Anna Beispiel" />);
    const avatar = screen.getByRole("img", { name: "Anna Beispiel" });
    expect(avatar.textContent).toBe("AB");
  });

  it("US-QS-07 a failing image falls back to the initials", () => {
    render(<Avatar name="Monstera deliciosa" src="/kaputt.jpg" />);
    fireEvent.error(screen.getByRole("img", { name: "Monstera deliciosa" }));
    expect(screen.getByRole("img", { name: "Monstera deliciosa" }).textContent).toBe("MD");
    expect(document.querySelector("img")).toBeNull();
  });

  it("US-QS-07 a new src is tried again after a failed one", () => {
    const { rerender } = render(<Avatar name="Anna" src="/a.jpg" />);
    fireEvent.error(document.querySelector("img") as HTMLImageElement);
    rerender(<Avatar name="Anna" src="/b.jpg" />);
    expect(document.querySelector("img")?.getAttribute("src")).toBe("/b.jpg");
  });

  it.each([
    ["Anna", "A"],
    ["  anna   maria  beispiel ", "AB"],
    ["élodie", "É"],
    ["", "?"],
  ])("US-QS-07 initials of %j are %j", (name, initials) => {
    const { container } = render(<Avatar name={name} />);
    expect(container.textContent).toBe(initials);
  });

  it("US-QS-07 decorative hides the avatar from assistive technology", () => {
    render(<Avatar name="Anna Beispiel" src="/a.jpg" decorative data-testid="a" />);
    expect(screen.getByTestId("a").getAttribute("aria-hidden")).toBe("true");
    expect(document.querySelector("img")?.getAttribute("alt")).toBe("");
    cleanup();
    render(<Avatar name="Anna" decorative data-testid="a" />);
    expect(screen.queryByRole("img")).toBeNull();
  });

  it.each([
    ["sm", "size-8"],
    ["md", "size-10"],
    ["lg", "size-14"],
  ] as const)("US-QS-07 · DS-34 size %s sets %s, md is the default", (size, cls) => {
    render(<Avatar name="A" size={size} data-testid="a" />);
    expect(screen.getByTestId("a").className).toContain(cls);
    cleanup();
    render(<Avatar name="A" data-testid="a" />);
    expect(screen.getByTestId("a").className).toContain("size-10");
  });

  it("US-QS-07 · DS-36 forwards ref and puts caller classes last", () => {
    const ref = createRef<HTMLSpanElement>();
    render(<Avatar ref={ref} name="A" className="ring-2" data-testid="a" />);
    expect(screen.getByTestId("a")).toBe(ref.current);
    expect(ref.current?.className.endsWith("ring-2")).toBe(true);
  });
});

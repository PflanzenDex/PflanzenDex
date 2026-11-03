// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Card } from "./card";

afterEach(cleanup);

describe("Card (US-QS-07, DS-34)", () => {
  it("US-QS-07 a plain card is a container with Greenhouse radius and elevation and no role", () => {
    render(<Card data-testid="c">Gießen am Montag</Card>);
    const card = screen.getByTestId("c");
    expect(card.tagName).toBe("DIV");
    expect(card.className).toContain("rounded-card");
    expect(card.className).toContain("shadow-elevation-1");
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("US-QS-14 a nested card is flat and tinted, so a card inside the page card has no second shadow", () => {
    render(
      <Card nested data-testid="c">
        Hinweis
      </Card>,
    );
    const card = screen.getByTestId("c");
    expect(card.className).toContain("bg-secondary");
    expect(card.className).toContain("shadow-none");
    expect(card.className).not.toContain("shadow-elevation-1");
    expect(card.className).not.toContain("bg-card");
  });

  it("US-QS-07 media and footer slots render around the body, and are left out when absent", () => {
    const { rerender } = render(
      <Card media={<img src="x.jpg" alt="Monstera" />} footer={<span>Heute</span>}>
        Körper
      </Card>,
    );
    expect(screen.getByRole("img", { name: "Monstera" })).toBeTruthy();
    expect(screen.getByText("Heute")).toBeTruthy();
    rerender(<Card data-testid="c">Körper</Card>);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByTestId("c").children).toHaveLength(0);
    expect(screen.getByTestId("c").querySelector("span")).toBeNull();
  });

  it("US-QS-07 with href the whole card is one link with focus ring and a 44 px target", () => {
    render(<Card href="/arten/1">Monstera deliciosa</Card>);
    const link = screen.getByRole("link", { name: "Monstera deliciosa" });
    expect(link.getAttribute("href")).toBe("/arten/1");
    expect(link.className).toContain("min-h-[44px]");
    expect(link.className).toContain("focus-visible:ring-2");
  });

  it("US-QS-07 with onClick the whole card is one button, reachable and operable by keyboard", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Card onClick={onClick}>Pflanze öffnen</Card>);
    const button = screen.getByRole("button", { name: "Pflanze öffnen" });
    expect(button.getAttribute("type")).toBe("button");
    expect(button.className).toContain("min-h-[44px]");
    expect(button.className).toContain("focus-visible:ring-2");
    await user.tab();
    expect(document.activeElement).toBe(button);
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("US-QS-07 the link is reached with Tab in document order", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Card href="/a">A</Card>
        <Card href="/b">B</Card>
      </>,
    );
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "A" }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "B" }));
  });

  it("US-QS-07 the hover lift is a shadow change that stops under reduced motion", () => {
    render(<Card href="/x">X</Card>);
    const cls = screen.getByRole("link").className;
    expect(cls).toContain("hover:shadow-elevation-2");
    expect(cls).toContain("motion-reduce:transition-none");
  });

  it("US-QS-07 · DS-36 forwards ref, native props and puts caller classes last", () => {
    const ref = createRef<HTMLElement>();
    render(
      <Card ref={ref} className="mt-4" data-testid="c">
        x
      </Card>,
    );
    expect(screen.getByTestId("c")).toBe(ref.current);
    expect(ref.current?.className.endsWith("mt-4")).toBe(true);
  });

  it("US-QS-14 without media and footer the children are direct children of the card, so a layout class reaches them", () => {
    render(
      <Card data-testid="c" className="grid gap-1">
        <p>Name</p>
        <p>Datum</p>
      </Card>,
    );
    const card = screen.getByTestId("c");
    expect(card.className).toContain("grid");
    expect(card.className).not.toMatch(/(^|\s)block(\s|$)/);
    expect(card.className).toContain("p-4");
    expect(Array.from(card.children).map((c) => c.textContent)).toEqual(["Name", "Datum"]);
  });

  it("US-QS-14 a link or button card also holds its children directly, with its own padding", () => {
    render(
      <>
        <Card href="/a" className="grid">
          <span>A1</span>
          <span>A2</span>
        </Card>
        <Card onClick={() => undefined} className="grid">
          <span>B1</span>
          <span>B2</span>
        </Card>
      </>,
    );
    for (const el of [screen.getByRole("link"), screen.getByRole("button")]) {
      expect(el.children).toHaveLength(2);
      expect(el.className).toContain("p-4");
      expect(el.className).not.toContain("p-0");
    }
  });

  it("US-QS-14 with media or footer the body block takes bodyClassName", () => {
    render(
      <Card data-testid="c" media={<i>m</i>} footer={<i>f</i>} bodyClassName="grid gap-1">
        <p>Körper</p>
      </Card>,
    );
    const body = screen.getByText("Körper").parentElement as HTMLElement;
    expect(body.className).toContain("grid");
    expect(body.className).toContain("p-4");
  });
});

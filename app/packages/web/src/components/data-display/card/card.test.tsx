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
    expect(screen.getByTestId("c").children).toHaveLength(1);
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
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Banner } from "./banner";

afterEach(cleanup);

describe("Banner (US-QS-07, DS-56)", () => {
  it.each(["info", "success", "warning"] as const)(
    "US-QS-07 · P-10 variant %s is a polite status",
    (variant) => {
      render(<Banner variant={variant}>Text</Banner>);
      expect(screen.getByRole("status").textContent).toBe("Text");
      expect(screen.queryByRole("alert")).toBeNull();
    },
  );

  it("US-QS-07 · P-10 error is an alert, read at once", () => {
    render(<Banner variant="error">Senden fehlgeschlagen</Banner>);
    expect(screen.getByRole("alert").textContent).toBe("Senden fehlgeschlagen");
  });

  it("US-QS-32 · SG-STATE-03 a focusable error banner shows its focus ring, for every error that takes the focus", () => {
    render(
      <Banner variant="error" tabIndex={-1}>
        Sichern hat nicht geklappt.
      </Banner>,
    );
    const banner = screen.getByRole("alert");
    expect(banner.className).toContain("focus-visible:outline-none");
    expect(banner.className).toContain("focus-visible:ring-2");
    expect(banner.className).toContain("focus-visible:ring-ring");
  });

  it("US-QS-07 · info is the default variant and the icon is hidden from assistive technology", () => {
    const { container } = render(<Banner>Text</Banner>);
    expect(screen.getByRole("status").className).toContain("bg-secondary");
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("US-QS-07 · P-09 shows the title and an action that runs on click", () => {
    const onClick = vi.fn();
    render(
      <Banner variant="warning" title="Lichtzone unbekannt" action={{ label: "Wählen", onClick }}>
        Text
      </Banner>,
    );
    expect(screen.getByText("Lichtzone unbekannt")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Wählen" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("US-QS-07 · has no buttons without action and dismiss, and never closes itself", () => {
    vi.useFakeTimers();
    render(<Banner>Text</Banner>);
    expect(screen.queryByRole("button")).toBeNull();
    vi.advanceTimersByTime(600_000);
    vi.useRealTimers();
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("US-QS-07 · P-10 the close button has a German name and only calls onDismiss", () => {
    const onDismiss = vi.fn();
    render(<Banner onDismiss={onDismiss}>Text</Banner>);
    fireEvent.click(screen.getByRole("button", { name: "Hinweis schließen" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("US-QS-07 · DS-36 forwards ref, native props and puts caller classes last", () => {
    const ref = createRef<HTMLDivElement>();
    render(<Banner ref={ref} className="mx-auto" data-testid="b" />);
    expect(screen.getByTestId("b")).toBe(ref.current);
    expect(ref.current?.className.endsWith("mx-auto")).toBe(true);
  });

  it("US-QS-03 the dismiss and the action control of a banner inside a form do not submit the form", () => {
    const onSubmit = vi.fn();
    const onDismiss = vi.fn();
    const onAction = vi.fn();
    render(
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <Banner
          variant="error"
          onDismiss={onDismiss}
          action={{ label: "Wählen", onClick: onAction }}
        >
          Text
        </Banner>
      </form>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Hinweis schließen" }));
    fireEvent.click(screen.getByRole("button", { name: "Wählen" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

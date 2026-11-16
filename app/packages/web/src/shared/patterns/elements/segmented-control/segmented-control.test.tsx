// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { SegmentedControl } from "./segmented-control";

afterEach(cleanup);

const OPTIONS = [
  { value: "a", label: "Pflanzen" },
  { value: "b", label: "Arten" },
];

function Host() {
  const [v, setV] = useState("a");
  return <SegmentedControl label="Ansicht" options={OPTIONS} value={v} onChange={setV} />;
}

describe("US-QS-14 segmented control", () => {
  it("US-QS-14 is a named group of toggle buttons and marks the selected one", () => {
    render(<Host />);
    expect(screen.getByRole("group", { name: "Ansicht" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pflanzen" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByRole("button", { name: "Arten" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("US-QS-14 a click selects the segment", async () => {
    render(<Host />);
    await userEvent.click(screen.getByText("Arten"));
    expect(screen.getByRole("button", { name: "Arten" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("US-QS-14 Tab reaches every segment and Enter and Space choose it, the focus stays on it", async () => {
    render(<Host />);
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Pflanzen" }));
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Arten" }));
    await userEvent.keyboard("{Enter}");
    expect(document.activeElement?.getAttribute("aria-pressed")).toBe("true");
    await userEvent.tab({ shift: true });
    await userEvent.keyboard(" ");
    expect(screen.getByRole("button", { name: "Pflanzen" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Pflanzen" }));
  });

  it("US-QS-14 every segment is a 44 px target", () => {
    const { container } = render(<Host />);
    const labels = container.querySelectorAll("button");
    for (const l of labels) expect(l.className).toContain("min-h-[44px]");
  });

  it("US-QS-32 the selected segment has no check mark: the raised fill, the weight and the boundary tell it apart", () => {
    const { container } = render(<Host />);
    const labels = container.querySelectorAll("button");
    expect(labels[0]?.querySelector("svg")).toBeNull();
    expect(labels[1]?.querySelector("svg")).toBeNull();
  });
});

describe("US-QS-32 segmented control: the selected segment (SG-CTRL-01)", () => {
  const choice = (name: string) => screen.getByRole("button", { name });

  it("US-QS-32 the selected segment has a semibold label in the text colour, the others a normal label in the muted colour", () => {
    render(<Host />);
    expect(choice("Pflanzen").className.split(" ")).toEqual(
      expect.arrayContaining(["font-semibold", "text-foreground"]),
    );
    expect(choice("Arten").className.split(" ")).toEqual(
      expect.arrayContaining(["font-normal", "text-muted-foreground"]),
    );
    expect(choice("Arten").className.split(" ")).not.toContain("font-semibold");
  });

  it("US-QS-32 the selected segment is a raised card fill with a 1 px boundary in the field colour, not a green fill", () => {
    render(<Host />);
    const selected = choice("Pflanzen").className.split(" ");
    expect(selected).toEqual(
      expect.arrayContaining(["bg-card", "shadow-elevation-1", "border", "border-input"]),
    );
    expect(selected).not.toContain("bg-accent");
  });

  it("US-QS-32 the other segments carry a transparent boundary of the same width, so nothing jumps when the selection moves", () => {
    render(<Host />);
    const other = choice("Arten").className.split(" ");
    expect(other).toEqual(expect.arrayContaining(["border", "border-transparent"]));
    expect(other).not.toContain("border-input");
    expect(other).not.toContain("bg-card");
  });

  it("US-QS-32 the segments share the full width in equal columns, not a pill that fits its text", () => {
    const { container } = render(<Host />);
    const group = container.querySelector('[role="group"]');
    expect(group?.className).toContain("w-full");
    expect(group?.className).toContain("auto-cols-fr");
    expect(group?.className).not.toContain("w-fit");
    expect(group?.className).not.toContain("inline-flex");
  });
});

describe("US-QS-32 segmented control on phones and in dark mode (issue 1045)", () => {
  it("US-QS-32 the selected segment is a raised card fill in both modes, readable beside the track", () => {
    render(
      <SegmentedControl
        label="Ansicht der Sammlung"
        options={[
          { value: "plants", label: "Pflanzen" },
          { value: "species", label: "Arten" },
        ]}
        value="species"
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Arten" }).className).toContain("bg-card");
    expect(screen.getByRole("button", { name: "Pflanzen" }).className).not.toContain("bg-card");
  });
});

describe("US-QS-32 segmented control with four choices (the Sammlung switch)", () => {
  const FOUR = [
    { value: "plants", label: "Pflanzen" },
    { value: "species", label: "Arten" },
    { value: "wishlist", label: "Wünsche" },
    { value: "equipment", label: "Geräte" },
  ];

  it("US-QS-32 four choices sit in a container: two columns, and four from a container width given in rem", () => {
    const { container } = render(
      <SegmentedControl label="Ansicht" options={FOUR} value="plants" onChange={() => undefined} />,
    );
    const wrapper = container.firstElementChild;
    expect(wrapper?.className).toContain("@container");
    const group = container.querySelector('[role="group"]');
    expect(group?.parentElement).toBe(wrapper);
    expect(group?.className).toContain("grid-cols-2");
    expect(group?.className).toMatch(/@min-\[[\d.]+rem\]:grid-cols-4/);
  });

  it("US-QS-32 four choices carry no sideways marker: at a larger text size they wrap to two rows instead of scrolling", () => {
    const { container } = render(
      <SegmentedControl label="Ansicht" options={FOUR} value="plants" onChange={() => undefined} />,
    );
    expect(container.querySelector('[role="group"]')?.getAttribute("data-scroll-x")).toBeNull();
  });

  it("US-QS-32 two or three choices keep one row that scrolls sideways at a larger text size, and no grid of two", () => {
    const { container } = render(<Host />);
    const group = container.querySelector('[role="group"]');
    expect(group?.getAttribute("data-scroll-x")).toBe("row");
    expect(group?.className).not.toContain("grid-cols-2");
    expect(group?.className).not.toContain("@min-");
  });
});

describe("US-QS-15 the switch at a larger text size (issue 1019)", () => {
  it("US-QS-15 the choices stay in one row that scrolls sideways inside its own box, and no choice shrinks or wraps", () => {
    const { container } = render(<Host />);
    const group = container.querySelector('[role="group"]');
    expect(group?.className).toContain("overflow-x-auto");
    expect(group?.className).not.toContain("flex-wrap");
    for (const choice of container.querySelectorAll("button"))
      expect(choice.className).toContain("shrink-0");
  });
});

describe("US-QS-11 · a choice shows its key", () => {
  it("US-QS-11 a choice with a shortcut names it for assistive technology and shows the key on desktop", () => {
    render(
      <SegmentedControl
        label="Ansicht"
        options={[
          { value: "a", label: "Pflanzen" },
          { value: "b", label: "Arten", keyHint: { visible: "p", aria: "p" } },
        ]}
        value="a"
        onChange={() => undefined}
      />,
    );
    const arten = screen.getByRole("button", { name: "Arten" });
    expect(arten.getAttribute("aria-keyshortcuts")).toBe("p");
    expect(arten.querySelector("kbd")?.textContent).toBe("p");
    expect(
      screen.getByRole("button", { name: "Pflanzen" }).getAttribute("aria-keyshortcuts"),
    ).toBeNull();
  });
});

describe("SegmentedControl alerts (US-QS-32 · F-0106)", () => {
  it("US-QS-32 · F-0106 a segment with errors shows a mark and carries its count in its accessible name, the others stay plain", () => {
    render(
      <SegmentedControl
        label="Teile"
        options={[
          { value: "pick", label: "Pflanzen (0)" },
          { value: "terms", label: "Termin" },
        ]}
        value="pick"
        onChange={() => undefined}
        alerts={{ pick: "1 Angabe fehlt" }}
      />,
    );
    expect(screen.getByRole("button", { name: "Pflanzen (0), 1 Angabe fehlt" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Termin" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Pflanzen (0), 1 Angabe fehlt" }).querySelector("svg"),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Termin" }).querySelector("svg")).toBeNull();
  });
});

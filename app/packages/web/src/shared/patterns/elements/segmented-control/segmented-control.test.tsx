// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SegmentedControl } from "./segmented-control";
import { rowFits } from "./label-probe/label-probe";

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

  it("US-QS-32 round 3 a segment keeps 4 px of vertical padding, so two rows of four fit at 200 % text (the 44 px minimum holds)", () => {
    const { container } = render(<Host />);
    for (const l of container.querySelectorAll("button")) {
      const classes = l.className.split(" ");
      expect(classes).toEqual(expect.arrayContaining(["py-1", "min-h-[44px]"]));
      expect(classes).not.toContain("py-2");
    }
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

  it("US-QS-32 two or three choices fit their row at normal text: one row, no sideways marker and no grid of two", () => {
    const { container } = render(<Host />);
    const group = container.querySelector('[role="group"]');
    expect(group?.getAttribute("data-scroll-x")).toBeNull();
    expect(group?.hasAttribute("data-stacked")).toBe(false);
    expect(group?.className).toContain("grid-flow-col");
    expect(group?.className).not.toContain("grid-cols-2");
    expect(group?.className).not.toContain("@min-");
  });

  it("US-QS-32 four choices: the track is a card radius on two rows and a pill on one row, the segments stay pills", () => {
    const { container } = render(
      <SegmentedControl label="Ansicht" options={FOUR} value="plants" onChange={() => undefined} />,
    );
    const classes = container.querySelector('[role="group"]')?.className.split(" ") ?? [];
    expect(classes).toEqual(expect.arrayContaining(["rounded-2xl", "@min-[20rem]:rounded-full"]));
    expect(classes).not.toContain("rounded-full");
    for (const choice of container.querySelectorAll("button"))
      expect(choice.className).toContain("rounded-full");
  });
});

describe("US-QS-32 segmented control while an action runs (busy)", () => {
  it("US-QS-32 a locked group keeps the chosen segment pressed and disables every segment", () => {
    render(
      <SegmentedControl
        label="Vorrat"
        options={[
          { value: "a", label: "Vorhanden" },
          { value: "b", label: "Leer" },
        ]}
        value="a"
        onChange={() => undefined}
        disabled
      />,
    );
    expect(screen.getByRole("button", { name: "Vorhanden" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    for (const choice of screen.getAllByRole("button"))
      expect((choice as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("US-QS-15 the switch at a larger text size (issue 1019, issue 2232)", () => {
  it("US-QS-15 rowFits: a row fits while the widest label with its padding fits its equal column", () => {
    // 360 px phone, 16 px gutters, 4 px track padding: 320 px inside, two columns of 158 px with the 4 px gap.
    expect(rowFits({ inner: 320, gap: 4, widest: 120, chrome: 10, count: 2 })).toBe(true);
    expect(rowFits({ inner: 320, gap: 4, widest: 150, chrome: 10, count: 2 })).toBe(false);
    expect(rowFits({ inner: 320, gap: 4, widest: 90, chrome: 10, count: 3 })).toBe(true);
    expect(rowFits({ inner: 320, gap: 4, widest: 100, chrome: 10, count: 3 })).toBe(false);
    // A hidden group (no width yet) keeps the row until it is measured again.
    expect(rowFits({ inner: 0, gap: 4, widest: 100, chrome: 10, count: 2 })).toBe(true);
  });

  describe("US-QS-15 at 200 % text on a 360 px phone the print format stacks instead of clipping (issue 2232)", () => {
    let width = 0;
    let label = 0;
    beforeEach(() => {
      vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => width);
      vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
        () =>
          ({
            width: label,
            height: 20,
            top: 0,
            left: 0,
            right: label,
            bottom: 20,
            x: 0,
            y: 0,
          }) as DOMRect,
      );
    });
    afterEach(() => vi.restoreAllMocks());

    const FORMAT = [
      { value: "sheet", label: "A4-Bogen" },
      { value: "single", label: "Einzeletikett" },
    ];
    const renderFormat = () =>
      render(
        <SegmentedControl
          label="Format"
          options={FORMAT}
          value="sheet"
          onChange={() => undefined}
        />,
      );

    it("US-QS-15 the longest label does not fit its column: the segments stack in one column, labels may wrap, nothing scrolls sideways", () => {
      // "Einzeletikett" in semibold at 200 % text is about 190 px; the group is 328 px wide on a 360 px phone.
      width = 328;
      label = 190;
      const { container } = renderFormat();
      const group = container.querySelector('[role="group"]');
      expect(group?.hasAttribute("data-stacked")).toBe(true);
      expect(group?.className.split(" ")).toEqual(
        expect.arrayContaining(["grid-cols-1", "rounded-2xl"]),
      );
      expect(group?.className).not.toContain("grid-flow-col");
      expect(group?.className).not.toContain("overflow-x-auto");
      expect(group?.getAttribute("data-scroll-x")).toBeNull();
      for (const choice of container.querySelectorAll("button")) {
        expect(choice.className).toContain("break-words");
        expect(choice.className).not.toContain("whitespace-nowrap");
        expect(choice.className).toContain("rounded-full");
      }
    });

    it("US-QS-15 the labels fit at normal text: one row of pills, each label on one line", () => {
      width = 328;
      label = 95;
      const { container } = renderFormat();
      const group = container.querySelector('[role="group"]');
      expect(group?.hasAttribute("data-stacked")).toBe(false);
      expect(group?.className).toContain("grid-flow-col");
      for (const choice of container.querySelectorAll("button"))
        expect(choice.className).toContain("whitespace-nowrap");
    });

    it("US-QS-15 the hidden one-line copy of the labels is never announced", () => {
      width = 328;
      label = 95;
      renderFormat();
      expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
        "A4-Bogen",
        "Einzeletikett",
      ]);
      // The copy is generated content inside an aria-hidden box: the label is text once, in its button.
      expect(screen.getAllByText("Einzeletikett")).toHaveLength(1);
      const copy = document.querySelector('[data-label="Einzeletikett"]');
      expect(copy?.textContent).toBe("");
      expect(copy?.closest('[aria-hidden="true"]')).toBeTruthy();
    });
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

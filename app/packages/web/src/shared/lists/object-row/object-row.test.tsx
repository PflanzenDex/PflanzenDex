// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Badge } from "@/shared/ui/badge";
import { plain } from "@/shared/testing/plain-text";
import { Button } from "@/shared/ui/button";
import { GroupedRow } from "../grouped-list/grouped-list";
import { ObjectRow } from "./object-row";

afterEach(cleanup);

const wrap = (ui: React.ReactNode) => <MemoryRouter>{ui}</MemoryRouter>;

/** The meta line of a row (`data-row-meta`), and the parts it holds (`data-meta-part`). */
const metaOf = (row: Element) => row.querySelector("[data-row-meta]") as HTMLElement;
const partsOf = (row: Element) => Array.from(row.querySelectorAll<HTMLElement>("[data-meta-part]"));

describe("US-QS-32 ObjectRow: the name wraps to two lines, the meta wraps too (SG-TYPE-05, SG-LIST-03)", () => {
  it("US-QS-32 a name of two lines is clamped at two lines and never cut at one", () => {
    render(
      wrap(
        <ObjectRow
          to="/plant/s1"
          title="Philodendron hederaceum Brasil – Ableger am Südfenster"
          meta="Philodendron hederaceum"
        />,
      ),
    );
    const name = screen.getByText("Philodendron hederaceum Brasil – Ableger am Südfenster");
    expect(name.className).toContain("line-clamp-2");
    expect(name.className).not.toContain("truncate");
    expect(name.className).not.toMatch(/\bline-clamp-1\b/);
  });

  it("US-QS-32 the name hyphenates at German syllables, so a long word breaks as 'Schmetterlings-orchidee' (issue 2366)", () => {
    render(wrap(<ObjectRow to="/plant/s1" title="Schmetterlingsorchidee" meta="Phalaenopsis" />));
    const name = screen.getByText("Schmetterlingsorchidee");
    expect(name.className.split(" ")).toContain("hyphens-auto");
    // The meta line is no name: it keeps the default (manual) break.
    expect(screen.getByText("Phalaenopsis").className.split(" ")).not.toContain("hyphens-auto");
  });

  it("US-QS-32 the meta line wraps to further lines when it is long and is never cut with an ellipsis (d-168, issue 2599)", () => {
    const long = "Zone 3 · 39 Pflanzen · Schwierigkeit: unbekannt";
    render(wrap(<ObjectRow to="/plant/s1" title="Clip" meta={long} />));
    // The whole text is in the DOM, not cut by script (the no-break space before each dot is a space to the eye).
    const meta = metaOf(screen.getByRole("link", { name: /^Clip/ }));
    expect(plain(meta.textContent)).toBe(long);
    const classes = meta.className.split(" ");
    // `truncate` is overflow hidden, an ellipsis and no wrapping: none of the three may stay (jsdom has no layout).
    expect(classes).not.toContain("truncate");
    expect(classes).not.toContain("text-ellipsis");
    expect(classes).not.toContain("overflow-hidden");
    expect(classes).not.toContain("whitespace-nowrap");
    // It breaks at spaces; a word wider than the column breaks as the last resort only, not at any letter.
    expect(classes).toContain("[overflow-wrap:break-word]");
    expect(classes).not.toContain("[overflow-wrap:anywhere]");
    // The meta line is no name: it takes no title clamp and no automatic hyphens.
    expect(classes).not.toContain("line-clamp-2");
    expect(classes).not.toContain("hyphens-auto");
  });

  it("US-QS-32 the thumbnail box is 56 px square and is reserved even while no picture is there (SG-PHOTO-01)", () => {
    const { container } = render(wrap(<ObjectRow to="/plant/s1" title="Clip" />));
    const box = container.querySelector('[class~="size-[56px]"]');
    expect(box).not.toBeNull();
    expect(box?.className).toContain("rounded-lg");
    expect(box?.className).toContain("shrink-0");
  });
});

describe("US-QS-32 ObjectRow: the whole row is the target, named by its title (SG-TOUCH-02, WCAG 2.5.3)", () => {
  it("US-QS-32 a row that navigates is one link to its address, named by its visible text in order: the title, the meta, the trailing element", () => {
    render(
      wrap(
        <ObjectRow
          to="/plant/s1"
          title="Clip"
          meta="Efeutute · Zone 2"
          trailing={<Badge variant="warning">Behandeln</Badge>}
        />,
      ),
    );
    const link = screen.getByRole("link", {
      name: (name) => plain(name) === "Clip Efeutute · Zone 2 Behandeln",
    });
    expect(link.getAttribute("href")).toBe("/plant/s1");
    expect(link.getAttribute("aria-labelledby")).toBeNull();
    expect(link.getAttribute("aria-describedby")).toBeNull();
  });

  it("US-QS-32 a row that acts is one button named by its title, and it runs its action", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(wrap(<ObjectRow title="Clip" meta="Efeutute" onClick={onClick} />));
    const button = screen.getByRole("button", { name: /^Clip(\s|$)/ });
    await user.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("US-QS-32 a row that opens a layer says so, with whether the layer is open", () => {
    render(
      wrap(<ObjectRow title="Clip" onClick={() => undefined} haspopup="dialog" expanded={true} />),
    );
    const button = screen.getByRole("button", { name: /^Clip(\s|$)/ });
    expect(button.getAttribute("aria-haspopup")).toBe("dialog");
    expect(button.getAttribute("aria-expanded")).toBe("true");
  });

  it("US-QS-32 the action stands beside the row, never inside it: no button nests in the link", () => {
    render(
      wrap(
        <ObjectRow
          to="/plant/s1"
          title="Bogenhanf"
          meta="Wechsel zur Wachstumsphase am 16.03.2027"
          action={
            <Button type="button" variant="secondary">
              Umstellen
            </Button>
          }
        />,
      ),
    );
    const link = screen.getByRole("link", { name: /^Bogenhanf/ });
    expect(within(link).queryByRole("button")).toBeNull();
    expect(screen.getByRole("button", { name: "Umstellen" })).toBeTruthy();
  });

  it("US-QS-32 an object row shows at most one trailing element: a badge or an action takes the place of the chevron (SG-LIST-03)", () => {
    const { rerender } = render(wrap(<ObjectRow to="/a" title="Clip" />));
    const plain = screen.getByRole("link", { name: "Clip" });
    expect(plain.querySelector("svg.size-4")).not.toBeNull();

    rerender(
      wrap(
        <ObjectRow to="/a" title="Clip" trailing={<Badge variant="warning">Weicht ab</Badge>} />,
      ),
    );
    const badged = screen.getByRole("link", { name: "Clip Weicht ab" });
    expect(badged.querySelector("svg.size-4")).toBeNull();
    expect(badged.textContent).toContain("Weicht ab");
  });
});

describe("US-QS-32 ObjectRow: a missing or failed picture shows the drawn placeholder (SG-PHOTO-02, P-10)", () => {
  it("US-QS-32 without a picture the thumbnail is the drawn placeholder, never an empty box", () => {
    const { container } = render(wrap(<ObjectRow to="/a" title="Clip" />));
    expect(container.querySelector("img")).toBeNull();
    const box = container.querySelector('[class~="size-[56px]"]');
    expect(box?.querySelector("svg")).not.toBeNull();
    expect(box?.querySelector("svg")?.parentElement?.getAttribute("aria-hidden")).toBe("true");
  });

  it("US-QS-32 a picture that fails to load turns into the drawn placeholder", () => {
    const { container } = render(wrap(<ObjectRow to="/a" title="Clip" src="blob:broken" />));
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    fireEvent.error(img as HTMLImageElement);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('[class~="size-[56px]"] svg')).not.toBeNull();
  });

  it("US-QS-32 a picture is decorative by default: its alternative text is empty and the name is the label", () => {
    const { container } = render(wrap(<ObjectRow to="/a" title="Clip" src="blob:picture" />));
    expect(container.querySelector("img")?.getAttribute("alt")).toBe("");
    expect(screen.getByRole("link", { name: "Clip" })).toBeTruthy();
  });
});

describe("US-QS-32 ObjectRow: a chevron on every opener, none on a row with its own trailing element or action or without a target (issue 2355, SG-TOUCH-02, SG-LIST-03)", () => {
  const chevron = (el: Element | null) => el?.querySelector("svg.lucide-chevron-right") ?? null;
  const layer = { onClick: () => undefined, haspopup: "dialog" as const };

  it("US-QS-32 · issue 2355 a link row that opens a view shows the chevron, decorative and at the trailing edge", () => {
    render(wrap(<ObjectRow to="/a" title="Clip" meta="Efeutute" />));
    const link = screen.getByRole("link", { name: /^Clip(\s|$)/ });
    const icon = chevron(link);
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
    expect(link.lastElementChild).toBe(icon);
  });

  it("US-QS-32 · issue 2355 a button row that opens a layer shows the chevron too", () => {
    render(wrap(<ObjectRow title="Clip" meta="Efeutute" expanded={false} {...layer} />));
    const button = screen.getByRole("button", { name: /^Clip(\s|$)/ });
    expect(button.getAttribute("aria-haspopup")).toBe("dialog");
    expect(chevron(button)).not.toBeNull();
  });

  it("US-QS-32 · issue 2355 a button row that acts shows the chevron (it is a target)", () => {
    render(wrap(<ObjectRow title="Clip" onClick={() => undefined} />));
    expect(chevron(screen.getByRole("button", { name: "Clip" }))).not.toBeNull();
  });

  it("US-QS-32 · issue 2355 a row with a trailing element shows no chevron, the element takes its place", () => {
    render(
      wrap(
        <ObjectRow title="Clip" trailing={<Badge variant="warning">Weicht ab</Badge>} {...layer} />,
      ),
    );
    expect(chevron(screen.getByRole("button", { name: "Clip Weicht ab" }))).toBeNull();
  });

  it("US-QS-32 · issue 2355 a row with an action beside it shows no chevron, in a link and in a layer opener alike", () => {
    const action = (
      <Button type="button" variant="secondary">
        Umstellen
      </Button>
    );
    const { container, rerender } = render(
      wrap(<ObjectRow to="/a" title="Clip" action={action} />),
    );
    expect(chevron(container)).toBeNull();
    rerender(wrap(<ObjectRow title="Clip" action={action} {...layer} />));
    expect(chevron(container)).toBeNull();
  });

  it("US-QS-32 · issue 2355 a row without a link or a button shows no chevron", () => {
    const { container } = render(wrap(<ObjectRow title="Clip" meta="Efeutute" />));
    expect(chevron(container)).toBeNull();
  });

  it("US-QS-32 · issue 2355 a caller cannot suppress the chevron of an opener: the prop is gone", () => {
    const suppress = { chevron: false } as object;
    render(wrap(<ObjectRow to="/a" title="Clip" {...suppress} />));
    expect(chevron(screen.getByRole("link", { name: "Clip" }))).not.toBeNull();
  });

  it("US-QS-32 · issue 2355 a plain GroupedRow without a target never draws a chevron", () => {
    const { container } = render(
      <MemoryRouter>
        <ul>
          <GroupedRow title="Was die App kann" />
        </ul>
      </MemoryRouter>,
    );
    expect(chevron(container)).toBeNull();
  });
});

describe("US-QS-32 the thumbnail of an object row is a fixed 56 px box at any text size (SG-PHOTO-01)", () => {
  it("US-QS-32 the box is sized in pixels, so a larger text size does not grow the picture beside the name", () => {
    const { container } = render(wrap(<ObjectRow to="/a" title="Clip" />));
    const box = container.querySelector('[class~="size-[56px]"]');
    expect(box?.className).toContain("shrink-0");
    expect(box?.className).not.toMatch(/\bsize-14\b/);
  });

  it("US-QS-32 the drawn placeholder is 36 px in the muted text token at full opacity, centred in the box (SG-PHOTO-02)", () => {
    const { container } = render(wrap(<ObjectRow to="/a" title="Clip" />));
    const svg = container.querySelector('[class~="size-[56px]"] svg');
    expect(svg?.getAttribute("class")).toContain("size-[36px]");
    expect(svg?.getAttribute("viewBox")).toBe("80 130 320 300");
    const drawn = svg?.parentElement;
    expect(drawn?.className).toContain("text-muted-foreground");
    expect(drawn?.className).toContain("items-center");
    expect(drawn?.className).not.toMatch(/opacity|\/\d+/);
  });
});

describe("US-QS-32 an object row is flat: the group draws the card, the row draws no box of its own (FX-35)", () => {
  it("US-QS-32 the row's root has no border, no radius and no background of its own", () => {
    const { container } = render(wrap(<ObjectRow to="/a" title="Clip" />));
    const root = container.firstElementChild;
    expect(root?.className).not.toMatch(/\bborder-border\b|\brounded-lg\b|\bbg-card\b/);
  });
});

describe("US-QS-32 ObjectRow: the row wraps its action, and the name keeps its two-line width beside it (issue 2322, SG-LIST-03)", () => {
  const action = (
    <Button type="button" variant="secondary">
      Umstellen
    </Button>
  );
  const classesOf = (el: Element | null | undefined) =>
    (el?.getAttribute("class") ?? "").split(" ");

  it("US-QS-32 the row may wrap, and its action is a shrink-0 box at the trailing edge of its own line", () => {
    const { container } = render(
      wrap(<ObjectRow to="/plant/s1" title="Bogenhanf" meta="Wechsel" action={action} />),
    );
    expect(classesOf(container.firstElementChild)).toContain("flex-wrap");
    const actionBox = screen.getByRole("button", { name: "Umstellen" }).parentElement;
    expect(classesOf(actionBox)).toEqual(
      expect.arrayContaining(["shrink-0", "ml-auto", "max-w-full"]),
    );
  });

  it("US-QS-32 the opener's minimum width is the thumbnail and two lines of name, in rem so it grows with the text", () => {
    render(wrap(<ObjectRow to="/plant/s1" title="Bogenhanf" meta="Wechsel" action={action} />));
    const opener = screen.getByRole("link", { name: /^Bogenhanf/ }).parentElement;
    expect(classesOf(opener)).toEqual(expect.arrayContaining(["min-w-0", "grow"]));
    expect(classesOf(opener)).toContain("basis-[calc(56px_+_8rem)]");
    expect(classesOf(opener)).not.toContain("flex-1");
  });

  it("US-QS-32 without an action the row has no action box and the opener is the whole row", () => {
    const { container } = render(wrap(<ObjectRow to="/plant/s1" title="Clip" />));
    expect(container.querySelector('[class~="max-w-full"]')).toBeNull();
    expect(classesOf(container.firstElementChild)).toContain("flex-wrap");
  });
});

describe("US-QS-32 ObjectRow: the meta line breaks only between its parts and never starts with a dot (issue 2606, d-168)", () => {
  const META = "Efeutute · Zone 3 — 1 Pflanzen · Mittel";
  const row = () => screen.getByRole("link", { name: /^Clip/ });

  it("US-QS-32 a meta with several parts renders one span per part, and its text is the original string", () => {
    render(wrap(<ObjectRow to="/plant/s1" title="Clip" meta={META} />));
    const parts = partsOf(row());
    expect(parts).toHaveLength(3);
    expect(parts.map((p) => plain(p.textContent))).toEqual([
      "Efeutute ·",
      "Zone 3 — 1 Pflanzen ·",
      "Mittel",
    ]);
    // Every part is a child of the meta line, and the text of the line is the string the caller gave.
    for (const part of parts) expect(part.parentElement).toBe(metaOf(row()));
    expect(plain(metaOf(row()).textContent)).toBe(META);
  });

  it("US-QS-32 no part starts with the dot: the separator ends the part before it, after a no-break space", () => {
    render(wrap(<ObjectRow to="/plant/s1" title="Clip" meta={META} />));
    const parts = partsOf(row());
    for (const part of parts) expect(part.textContent?.trimStart().startsWith("·")).toBe(false);
    // The last part has no separator; each other part ends with "\u00A0·" (no break before the dot).
    expect(parts.map((p) => p.textContent?.endsWith("\u00A0·"))).toEqual([true, true, false]);
    // Between two parts there is one plain space: the only place where the line may break.
    const line = metaOf(row());
    const gaps = Array.from(line.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent);
    expect(gaps).toEqual([" ", " "]);
  });

  it("US-QS-32 a part stays together when it fits and wraps at its own spaces only when wider than the column", () => {
    render(wrap(<ObjectRow to="/plant/s1" title="Clip" meta={META} />));
    const classes = partsOf(row())[1]?.className.split(" ") ?? [];
    // An inline box that is as wide as its text, never wider than the column; `align-top` keeps the lines of a wrapped part aligned.
    expect(classes).toEqual(expect.arrayContaining(["inline-block", "max-w-full", "align-top"]));
    // A long word inside a part breaks as the last resort (inherited from the meta line), never overflows.
    expect(metaOf(row()).className.split(" ")).toContain("[overflow-wrap:break-word]");
  });

  it("US-QS-32 the meta line balances its last line, so a single word does not stand alone (text-pretty)", () => {
    render(wrap(<ObjectRow to="/plant/s1" title="Clip" meta={META} />));
    expect(metaOf(row()).className.split(" ")).toContain("text-pretty");
  });

  it("US-QS-32 a meta without a separator stays one plain text, and an element that is no fragment stays as given", () => {
    const { rerender } = render(wrap(<ObjectRow to="/plant/s1" title="Clip" meta="Efeutute" />));
    expect(partsOf(row())).toHaveLength(0);
    expect(metaOf(row()).textContent).toBe("Efeutute");
    rerender(wrap(<ObjectRow to="/plant/s1" title="Clip" meta={<b>Efeutute · Zone 2</b>} />));
    expect(partsOf(row())).toHaveLength(0);
    expect(metaOf(row()).textContent).toBe("Efeutute · Zone 2");
  });

  it("US-QS-32 a fragment of an italic name and a text is split too: the name stays whole in its part (the wish row, issue 2606)", () => {
    render(
      wrap(
        <ObjectRow
          to="/plant/s1"
          title="Clip"
          meta={
            <>
              <i className="italic">Haworthia fasciata</i>
              {" · Zone 3 — 1 Pflanzen · Schwierigkeit: Mittel"}
            </>
          }
        />,
      ),
    );
    const parts = partsOf(row());
    expect(parts.map((p) => plain(p.textContent))).toEqual([
      "Haworthia fasciata ·",
      "Zone 3 — 1 Pflanzen ·",
      "Schwierigkeit: Mittel",
    ]);
    // The italic name is the first part's element, and the dot follows it in the same part.
    expect(parts[0]?.querySelector("i")?.textContent).toBe("Haworthia fasciata");
    expect(parts[0]?.textContent?.endsWith("\u00A0·")).toBe(true);
    expect(plain(metaOf(row()).textContent)).toBe(
      "Haworthia fasciata · Zone 3 — 1 Pflanzen · Schwierigkeit: Mittel",
    );
  });

  it("US-QS-32 a fragment with a lone separator between two elements puts the dot at the end of the part before it", () => {
    render(
      wrap(
        <ObjectRow
          to="/plant/s1"
          title="Clip"
          meta={
            <>
              <b>Behandeln</b>
              {" · "}
              {"Efeutute · Lichtzone unbekannt"}
            </>
          }
        />,
      ),
    );
    expect(partsOf(row()).map((p) => plain(p.textContent))).toEqual([
      "Behandeln ·",
      "Efeutute ·",
      "Lichtzone unbekannt",
    ]);
    expect(plain(metaOf(row()).textContent)).toBe("Behandeln · Efeutute · Lichtzone unbekannt");
  });

  it("US-QS-15 SG-TYPE-05 the parts of the meta of a row that is no object row (a settings row) stay whole too (issue 2640)", () => {
    render(
      <MemoryRouter>
        <ul>
          <GroupedRow to="/konto" title="Konto" meta="Lena · Europe/Berlin" />
        </ul>
      </MemoryRouter>,
    );
    const parts = partsOf(document.body);
    expect(parts.map((p) => plain(p.textContent))).toEqual(["Lena ·", "Europe/Berlin"]);
    for (const part of parts)
      expect(part.className.split(" ")).toEqual(
        expect.arrayContaining(["inline-block", "max-w-full", "align-top"]),
      );
    // The line is the same text as before and the link is named by it in order (WCAG 2.5.3); its own classes stay.
    const line = parts[0]?.parentElement as HTMLElement;
    expect(plain(line.textContent)).toBe("Lena · Europe/Berlin");
    expect(line.className.split(" ")).toEqual(
      expect.arrayContaining(["text-sm", "[overflow-wrap:anywhere]"]),
    );
    expect(line.className.split(" ")).not.toContain("[overflow-wrap:break-word]");
    expect(plain(screen.getByRole("link").textContent)).toBe("Konto Lena · Europe/Berlin");
  });

  it("US-QS-15 SG-TYPE-05 the meta of a settings row with one part stays one plain text", () => {
    render(
      <MemoryRouter>
        <ul>
          <GroupedRow to="/konto" title="Konto" meta="Lena" />
        </ul>
      </MemoryRouter>,
    );
    expect(document.querySelectorAll("[data-meta-part]")).toHaveLength(0);
    expect(screen.getByText("Lena")).toBeTruthy();
  });

  it("US-QS-32 WCAG 2.5.3 the link is named by its visible text in order, the parts included", () => {
    render(
      wrap(
        <ObjectRow
          to="/plant/s1"
          title="Clip"
          meta="Efeutute · Zone 2"
          trailing={<Badge variant="warning">Behandeln</Badge>}
        />,
      ),
    );
    // The no-break space before a dot is a space to a screen reader and to speech input.
    const link = screen.getByRole("link", {
      name: (name) => plain(name) === "Clip Efeutute · Zone 2 Behandeln",
    });
    expect(plain(link.textContent)).toBe("Clip Efeutute · Zone 2 Behandeln");
    expect(link.getAttribute("aria-labelledby")).toBeNull();
  });
});

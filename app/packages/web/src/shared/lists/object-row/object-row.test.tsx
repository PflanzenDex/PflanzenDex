// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Badge } from "@/shared/ui/display/badge/badge";
import { Button } from "@/shared/ui/button/button";
import { GroupedRow } from "../grouped-list/grouped-list";
import { ObjectRow } from "./object-row";

afterEach(cleanup);

const wrap = (ui: React.ReactNode) => <MemoryRouter>{ui}</MemoryRouter>;

describe("US-QS-32 ObjectRow: the name wraps to two lines, the meta is one line (SG-TYPE-05, SG-LIST-03)", () => {
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

  it("US-QS-32 the meta line is one line that truncates, so it never adds a second line to the row", () => {
    render(
      wrap(
        <ObjectRow
          to="/plant/s1"
          title="Clip"
          meta="Efeutute · Lichtzone unbekannt · Schlafzimmer am Fenster"
        />,
      ),
    );
    const meta = screen.getByText("Efeutute · Lichtzone unbekannt · Schlafzimmer am Fenster");
    expect(meta.className).toContain("truncate");
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
    const link = screen.getByRole("link", { name: "Clip Efeutute · Zone 2 Behandeln" });
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

describe("US-QS-32 ObjectRow: a chevron only on a link or button, and a row can only suppress it (SG-TOUCH-02, SG-LIST-03)", () => {
  const chevron = (el: Element | null) => el?.querySelector("svg.size-4") ?? null;

  it("US-QS-32 a static object row never draws a chevron", () => {
    const { container } = render(wrap(<ObjectRow title="Clip" meta="Efeutute" />));
    expect(chevron(container)).toBeNull();
  });

  it("US-QS-32 a link row draws the chevron when it has no trailing element or action", () => {
    render(wrap(<ObjectRow to="/a" title="Clip" />));
    expect(chevron(screen.getByRole("link", { name: "Clip" }))).not.toBeNull();
  });

  it("US-QS-32 a plain GroupedRow never draws a chevron, even when one is asked for", () => {
    const { container } = render(
      <MemoryRouter>
        <ul>
          <GroupedRow title="Was die App kann" chevron />
        </ul>
      </MemoryRouter>,
    );
    expect(chevron(container)).toBeNull();
  });

  it("US-QS-32 a link row can suppress its chevron, and a chevron never comes back as a trailing element", () => {
    render(
      wrap(
        <ul>
          <GroupedRow to="/a" title="Clip" chevron={false} />
        </ul>,
      ),
    );
    expect(chevron(screen.getByRole("link", { name: "Clip" }))).toBeNull();
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

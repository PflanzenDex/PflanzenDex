// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { useInLayer } from "@/shared/ui/layer-scope";
import { LayerHost, LayerOpener, LayerSheet } from "../../layer-sheet";

beforeAll(() => {
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
});

afterEach(cleanup);

/** Says where it stands: a layer (sheet, dialog or pane) provides the scope for everything it holds (SG-LIST-01). */
function Scope(props: { name: string }) {
  return <p>{`${props.name}: ${useInLayer() ? "in a layer" : "on a page"}`}</p>;
}

function layer() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <LayerHost>
        <LayerOpener id="details">Details</LayerOpener>
        <LayerSheet id="details" title="Details" primaryAction={<Scope name="Aktion" />}>
          <Scope name="Inhalt" />
        </LayerSheet>
      </LayerHost>
    </MemoryRouter>,
  );
}

async function open(name: "dialog" | "complementary") {
  await userEvent.click(screen.getByRole("button", { name: "Details" }));
  return screen.findByRole(name, { name: "Details" });
}

describe("US-QS-15 · SG-LIST-01 every container of a layer gives its scope to all it holds", () => {
  it.each([
    ["a phone sheet", 360, "dialog"],
    ["a dialog", 800, "dialog"],
    ["a pane from 1024 px", 1280, "complementary"],
  ] as const)(
    "US-QS-15 in %s the content and the primary action are in the layer scope",
    async (_name, width, role) => {
      setViewportWidth(width);
      layer();
      const container = await open(role);
      expect(within(container).getByText("Inhalt: in a layer")).toBeTruthy();
      expect(within(container).getByText("Aktion: in a layer")).toBeTruthy();
    },
  );
});

describe("US-QS-15 · DS-61 the pane takes the height that is left in its frame, not the window height minus a constant", () => {
  it("US-QS-15 the pane column stretches with the frame and may shrink below its content, so a frame of any height holds the pane", async () => {
    setViewportWidth(1280);
    layer();
    const pane = await open("complementary");
    const slot = pane.parentElement as HTMLElement;
    const slotClasses = slot.className.split(/\s+/);
    // The column of the pane has the height of the frame (`self-stretch`), and a stretched column of a frame whose height is
    // given may be lower than its content (`min-h-0`): a pane that starts below a title no longer pushes the frame past the window.
    expect(slotClasses).toContain("lg:self-stretch");
    expect(slotClasses).toContain("lg:min-h-0");
    expect(slotClasses).not.toContain("lg:self-start");
    // The pane itself shrinks into that column and scrolls inside (its body is the scroll region); the cap of the window
    // height only bounds a pane in a frame whose height is not given.
    const paneClasses = pane.className.split(/\s+/);
    expect(paneClasses).toContain("min-h-0");
    expect(paneClasses).toContain("shrink");
    expect(paneClasses.some((name) => name.startsWith("max-h-"))).toBe(true);
  });

  it("US-QS-15 no destination overrides the height of the pane: the frame of Konto passes only its own classes", () => {
    // The override of issue 2515 (`[&_[data-layer-pane]]:max-h-[calc(100dvh-6.5rem)]` on the frame of Konto) is gone: the
    // pane finds its height in the frame, so no destination needs to know where it starts.
    // The tests of the package run from its folder.
    const source = readFileSync(
      join(process.cwd(), "src/app/destinations/account-area/account-area.tsx"),
      "utf8",
    );
    expect(source).not.toContain("data-layer-pane");
    expect(source).not.toContain("100dvh");
  });
});

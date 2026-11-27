import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  closeLayer,
  heightOf,
  openLayer,
  sheetOf,
  visibleHeight,
} from "@/shared/testing/story-frame/sheet-play";
import { check, hasLayout, must, waitUntil } from "@/shared/testing/story-frame/story-play";
import { CardMore, CardSection } from "./card-more";

// Catalog of the Mehr button of a two-level card and the half-height sheet it opens (US-QS-15, US-QS-32, owner decision
// d-066). Light and dark come from the theme toolbar. Press "Mehr" with Enter or Space: the sheet is titled with the card name,
// "Schließen" and Escape close it, and the focus returns to "Mehr".
const meta = {
  title: "data-display/CardMore",
  component: CardMore,
  args: { name: "Monstera deliciosa", children: null },
  decorators: [
    (Story) => (
      <div className="p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CardMore>;

export default meta;
type Story = StoryObj<typeof meta>;

const LINES = Array.from(
  { length: 24 },
  (_, index) => `Zeile ${index + 1} der Beschreibung dieser Art.`,
);

/** The sections of a species card: a long text, so the content of the sheet is longer than half the window. */
const sections = (
  <>
    <CardSection title="Beschreibung">
      {LINES.map((line) => (
        <p key={line} className="m-0 text-sm">
          {line}
        </p>
      ))}
    </CardSection>
    <CardSection title="Quellen">
      <a href="https://de.wikipedia.org/wiki/Monstera_deliciosa" className="text-sm underline">
        Wikipedia (CC BY-SA)
      </a>
    </CardSection>
  </>
);

export const Default: Story = { args: { children: sections } };

// The button is named "Mehr: {name}", opens a sheet titled with the card name at half height of the visible window (a window of
// 360 x 640 px in the conformance run), and the focus returns to "Mehr" when it closes (US-QS-08, SG-SHEET-02).
export const OpensHalfHeight: Story = {
  args: { children: sections },
  play: async ({ canvasElement }) => {
    const opener = must(
      canvasElement.querySelector<HTMLElement>('[aria-haspopup="dialog"]'),
      "the Mehr button",
    );
    check(
      opener.getAttribute("aria-label") === "Mehr: Monstera deliciosa",
      "the button is named Mehr: and the card name",
    );
    const layer = await openLayer(canvasElement);
    check(
      layer.getAttribute("aria-labelledby") !== null &&
        document.getElementById(layer.getAttribute("aria-labelledby") ?? "")?.textContent ===
          "Monstera deliciosa",
      "the sheet is titled with the card name",
    );
    const sheet = sheetOf();
    if (sheet && hasLayout(sheet))
      await waitUntil(
        () => Math.abs(heightOf(sheet) - visibleHeight() / 2) <= 3,
        "a long content opens at half the visible window",
      );
    await closeLayer();
    await waitUntil(() => document.activeElement === opener, "the focus returns to Mehr");
  },
};

// The focus returns to "Mehr" after the close button too, not only after Escape (WCAG 2.4.3, DS-40): the button the sheet
// closes from is the one a keeper pressed to open it.
export const FocusReturnsAfterClose: Story = {
  args: { children: sections },
  play: async ({ canvasElement }) => {
    const opener = must(
      canvasElement.querySelector<HTMLElement>('[aria-haspopup="dialog"]'),
      "the Mehr button",
    );
    opener.focus();
    const layer = await openLayer(canvasElement);
    const close = must(layer.querySelector<HTMLElement>("[data-close]"), "the close button");
    close.click();
    await waitUntil(() => document.querySelector('[role="dialog"]') === null, "the sheet closes");
    await waitUntil(() => document.activeElement === opener, "the focus returns to Mehr");
  },
};

// A long one-word name breaks inside the sheet title and does not widen the sheet (SG-TYPE-05).
export const LongNameTitle: Story = {
  args: { name: "Schwiegermutterzungenblattpflanze", children: sections },
  play: async ({ canvasElement }) => {
    const layer = await openLayer(canvasElement);
    check(
      layer.scrollWidth <= layer.clientWidth + 1,
      "a long name does not widen the sheet sideways",
    );
    await closeLayer();
  },
};

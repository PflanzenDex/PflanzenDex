import type { Meta, StoryObj } from "@storybook/react-vite";
import type { SpeciesHit } from "@pflanzendex/core";
import { checkFocusRings } from "@/shared/testing/focus-ring/focus-ring.play";
import { withRouter } from "@/shared/testing/story-frame/story-frame";
import { HitList } from "./hit-list";

// Catalog of the hit list of "Entdecken", mode "Katalog" (US-QS-15, WCAG 2.4.7, issue 2650): compact rows (scientific name, German
// name, one fact) in the scrolling list of a page, 360 px wide. The play gives every row the focus and checks that its ring lies
// inside the list that clips it (`checkFocusRings`); jsdom checks only the structure, the browser run (`make sb-test`) the boxes.
const hit = (id: string, latinName: string, germanName: string | null): SpeciesHit =>
  ({
    id,
    latinName,
    germanName,
    difficulty: null,
    reviewStatus: "reviewed",
    hit: null,
  }) as SpeciesHit;

const HITS: readonly SpeciesHit[] = [
  hit("s1", "Adiantum raddianum", "Frauenhaarfarn"),
  hit("s2", "Aloe vera", "Echte Aloe"),
  hit("s3", "Ficus elastica", "Gummibaum"),
  hit("s4", "Haworthiopsis attenuata", "Zebra-Haworthie"),
  hit("s5", "Monstera deliciosa", "Fensterblatt"),
  hit("s6", "Zamioculcas zamiifolia", null),
];

const meta = {
  title: "catalog/HitList",
  component: HitList,
  args: { hit: HITS, onOpen: () => undefined, resetKey: "" },
  decorators: [
    withRouter,
    (Story) => (
      <div className="flex h-[300px] w-[360px] flex-col bg-background p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof HitList>;

export default meta;
type Story = StoryObj<typeof meta>;

// The rows sit at the left and right edge of the scrolling list, and the first one at its top edge: a ring outside the row is cut
// there (issue 2650).
export const FocusRingInScrollingList: Story = {
  play: ({ canvasElement }) => checkFocusRings(canvasElement),
};

import type { Decorator } from "@storybook/react-vite";
import { cn } from "@/shared/lib/utils";

// The frame of the stories of the table that stays at the top and at the left (`table.stories.tsx`, US-QS-15, issue 2601).

/** The widths of the phones of issue 2601, as whole classes so that Tailwind finds them (DS-32: no inline style). */
const WIDTHS = { 360: "w-[360px]", 393: "w-[393px]" } as const;

/**
 * The frame of a screen (DS-58): a column of a given height that the table fills and scrolls in; the frame itself never scrolls.
 * It has the width of a phone, whatever the width of the page: the stories of the table prove the same at 360 and at 393 px
 * in every run, also in the test runner with its own page width.
 */
export const inFrameOf =
  (width: keyof typeof WIDTHS): Decorator =>
  (Story) => (
    <div data-frame="" className={cn("flex h-[360px] shrink-0 flex-col p-4", WIDTHS[width])}>
      <Story />
    </div>
  );

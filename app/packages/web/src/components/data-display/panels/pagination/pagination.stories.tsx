import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { Pagination } from "./pagination";

// Catalog of the numbered Pagination (TE-18, US-QS-07). Light and dark come from the theme toolbar. Tab to a page,
// press Enter. States: first page (previous disabled), middle with gaps, last page (next disabled).
const meta = {
  title: "data-display/Pagination",
  component: Pagination,
  args: { page: 1, pageCount: 12, onPageChange: () => undefined },
  decorators: [
    (Story) => (
      <div className="w-[360px] max-w-full p-4 sm:w-auto">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Pagination>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FirstPage: Story = {};

export const MiddlePage: Story = { args: { page: 6 } };

export const LastPage: Story = { args: { page: 12 } };

export const FewPages: Story = { args: { page: 2, pageCount: 4 } };

/** Stateful: clicking moves the page, as a screen would with a page number in its query key. */
export const Interactive: Story = {
  render: (args) => {
    const [page, setPage] = React.useState(args.page);
    return <Pagination {...args} page={page} onPageChange={setPage} />;
  },
};

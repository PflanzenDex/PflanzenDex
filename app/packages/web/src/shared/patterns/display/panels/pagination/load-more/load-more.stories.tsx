import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { LoadMore } from "./load-more";

// Catalog of "Mehr laden" (TE-18, US-QS-07). Light and dark come from the theme toolbar. Press the button with Enter or
// Space: focus stays on it while the page loads (fake query, 0.8 s). The fake query mimics react-query's
// useInfiniteQuery: `hasNextPage` and `isFetchingNextPage` map to `hasMore` and `pending`, `fetchNextPage` to `onLoadMore`.
const meta = {
  title: "data-display/LoadMore",
  component: LoadMore,
  args: {
    loadedCount: 20,
    totalCount: 45,
    hasMore: true,
    pending: false,
    onLoadMore: () => undefined,
  },
  decorators: [
    (Story) => (
      <div className="w-[360px] max-w-full p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LoadMore>;

export default meta;
type Story = StoryObj<typeof meta>;

const TOTAL = 45;
const PAGE_SIZE = 20;

function useFakeInfinite() {
  const [loaded, setLoaded] = React.useState(PAGE_SIZE);
  const [isFetchingNextPage, setFetching] = React.useState(false);
  const fetchNextPage = () => {
    setFetching(true);
    setTimeout(() => {
      setLoaded((n) => Math.min(n + PAGE_SIZE, TOTAL));
      setFetching(false);
    }, 800);
  };
  return { loaded, hasNextPage: loaded < TOTAL, isFetchingNextPage, fetchNextPage };
}

export const Infinite: Story = {
  render: () => {
    const q = useFakeInfinite();
    return (
      <LoadMore
        loadedCount={q.loaded}
        totalCount={TOTAL}
        hasMore={q.hasNextPage}
        pending={q.isFetchingNextPage}
        onLoadMore={q.fetchNextPage}
      />
    );
  },
};

export const Idle: Story = {};

export const Pending: Story = { args: { pending: true } };

export const UnknownTotal: Story = { args: { totalCount: undefined } };

export const AllLoaded: Story = { args: { loadedCount: 45, hasMore: false } };

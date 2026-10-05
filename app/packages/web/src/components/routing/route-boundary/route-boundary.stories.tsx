import type { Meta, StoryObj } from "@storybook/react-vite";
import { lazyPage } from "@/components/routing/lazy-page/lazy-page";
import { RouteBoundary } from "./route-boundary";

// Catalog of the RouteBoundary (TE-17, DS-08, DS-55): the skeleton while a page chunk loads, the error with retry when it fails.
const Loading = lazyPage(() => new Promise<{ default: () => null }>(() => undefined));
const Failing = lazyPage(() => Promise.reject<{ default: () => null }>(new Error("chunk failed")));

const meta = { title: "routing/RouteBoundary", component: RouteBoundary } satisfies Meta<
  typeof RouteBoundary
>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default: the page code is still on its way, one loading status. */
export const Default: Story = {
  args: { resetKey: "loading", children: <Loading /> },
};

/** The chunk could not be fetched: an error with "Erneut versuchen". */
export const ChunkFailed: Story = {
  args: { resetKey: "failed", children: <Failing /> },
};

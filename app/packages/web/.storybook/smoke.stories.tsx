import type { Meta, StoryObj } from "@storybook/react-vite";

// Setup check only (TE-18): proves Storybook, the tokens and the scheme toolbar run. Not a component story.
const meta = { title: "Setup/Smoke", component: () => <p>Katalog läuft</p> } satisfies Meta;

export default meta;
export const Default: StoryObj<typeof meta> = {};

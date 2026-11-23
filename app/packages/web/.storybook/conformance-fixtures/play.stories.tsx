import type { Meta, StoryObj } from "@storybook/react-vite";

// Fixtures of the play functions of the QG-U5 conformance run (US-QS-15, P-B; never part of the catalog). `Pass` plays
// and passes. `Fail` throws on purpose: the run must name it as a play failure. `LateTarget` adds a 36 px button only
// after a wait longer than the network settle, so the run finds it only if it probes after the play (DS-15).
const meta = {
  title: "conformance-fixture/Play",
  component: () => <p className="p-4">Spiel</p>,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pass: Story = {
  play: ({ canvasElement }) => {
    if (!canvasElement.querySelector("p")) throw new Error("the fixture text is missing");
  },
};

export const Fail: Story = {
  play: () => {
    throw new Error("the fixture play function throws on purpose");
  },
};

export const LateTarget: Story = {
  play: async ({ canvasElement }) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const button = document.createElement("button");
    button.textContent = "Klein";
    button.style.width = "96px";
    button.style.height = "36px";
    canvasElement.append(button);
  },
};

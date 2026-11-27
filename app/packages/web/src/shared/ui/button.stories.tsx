import type { Meta, StoryObj } from "@storybook/react-vite";
import { Sprout } from "lucide-react";
import { Button } from "./button";

// Catalog of every Button variant, size and state (TE-18, DS-15, DS-35). Sample texts are German as in the app.
const meta = {
  title: "ui/Button",
  component: Button,
  args: { children: "Sichern" },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

const variants = [
  "default",
  "secondary",
  "tinted",
  "plain",
  "ghost",
  "destructive",
  "destructive-plain",
  "link",
] as const;
const sizes = ["default", "sm", "lg", "touch"] as const;

export const Default: Story = {};

export const AllVariants: Story = {
  render: (args) => (
    <div className="flex flex-col gap-2 p-4">
      {variants.map((variant) => (
        <Button key={variant} {...args} variant={variant}>
          {variant}
        </Button>
      ))}
    </div>
  ),
};

export const Sizes: Story = {
  render: (args) => (
    <div className="flex flex-col items-start gap-2 p-4">
      {sizes.map((size) => (
        <Button key={size} {...args} size={size}>
          {size}
        </Button>
      ))}
      <Button {...args} size="icon" aria-label="Schließen">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </Button>
    </div>
  ),
};

export const Focus: Story = {
  args: { autoFocus: true },
  render: (args) => (
    <div className="p-4">
      <Button {...args}>Fokus</Button>
    </div>
  ),
};

export const Disabled: Story = {
  render: (args) => (
    <div className="flex flex-col gap-2 p-4">
      {variants.map((variant) => (
        <Button key={variant} {...args} variant={variant} disabled>
          {variant}
        </Button>
      ))}
    </div>
  ),
};

export const Pending: Story = {
  render: (args) => (
    <div className="flex flex-col gap-2 p-4">
      <Button {...args} pending>
        Sichern
      </Button>
      <Button {...args} variant="tinted" pending pendingLabel="Wird gesichert…">
        Sichern
      </Button>
    </div>
  ),
};

export const AsLink: Story = {
  render: (args) => (
    <div className="p-4">
      <Button {...args} asChild variant="tinted">
        <a href="#pflanzen">Zu den Pflanzen</a>
      </Button>
    </div>
  ),
};

export const Row: Story = {
  render: (args) => (
    <div className="w-72 p-4">
      <Button {...args} variant="ghost" size="row">
        Zeile in einer Liste
      </Button>
    </div>
  ),
};

// A long German label beside an icon on a 320 px phone: 288 px of content with 16 px padding (US-QS-07, SG-ICON-01, issue 2564).
// The box is 320 px, not 20 rem, so it stays narrow at a large text size. The label wraps and the icon keeps its size.
export const LongLabelWithIcon: Story = {
  render: (args) => (
    <div className="flex w-[320px] flex-col gap-2 p-4">
      <Button {...args}>
        <Sprout aria-hidden="true" className="size-5" />
        Pflanze mit frischer Erde in den neuen Topf umsetzen
      </Button>
      <Button {...args} variant="tinted">
        <Sprout aria-hidden="true" className="size-5" />
        Düngerlösung für Orchideen ansetzen
      </Button>
    </div>
  ),
};

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";

// Catalog of every Button variant, size and state (TE-18, DS-15, DS-35). Sample texts are German as in the app.
const meta = {
  title: "ui/Button",
  component: Button,
  args: { children: "Speichern" },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

const variants = ["default", "secondary", "outline", "ghost", "destructive", "link"] as const;
const sizes = ["default", "sm", "lg", "touch"] as const;

export const Default: Story = {};

export const Variants: Story = {
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
        Speichern
      </Button>
      <Button {...args} variant="outline" pending pendingLabel="Wird gespeichert…">
        Speichern
      </Button>
    </div>
  ),
};

export const AsLink: Story = {
  render: (args) => (
    <div className="p-4">
      <Button {...args} asChild variant="outline">
        <a href="#pflanzen">Zu den Pflanzen</a>
      </Button>
    </div>
  ),
};

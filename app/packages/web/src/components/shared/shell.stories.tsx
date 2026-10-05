import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter } from "react-router";
import { AppShell } from "./app-shell";
import { GlobalHeader } from "./global-header";
import { MobileNavBar } from "./mobile-nav-bar";
import type { NavItem } from "./nav-item";

// Catalog of the shell (TE-18): phone, tablet and desktop come from the viewport toolbar; sample texts are German.
const dot = <span aria-hidden="true" className="size-5 rounded-full bg-muted" />;
const labels = [
  "Start",
  "Bestand",
  "Behandlung",
  "Pokédex",
  "Arten",
  "Hinweise",
  "Pflegephasen",
  "Wunschliste",
  "Einstellungen",
];
const paths = [
  "/",
  "/collection",
  "/treatments",
  "/pokedex",
  "/species",
  "/hints",
  "/care-phases",
  "/wishlist",
  "/settings",
];
const items: NavItem[] = labels.map((label, i) => ({ href: paths[i] ?? "/", label, icon: dot }));

const withRouter: Decorator = (Story, ctx) => (
  <MemoryRouter initialEntries={[String(ctx.parameters["path"] ?? "/")]}>
    <Story />
  </MemoryRouter>
);

const meta = {
  title: "shared/AppShell",
  component: AppShell,
  decorators: [withRouter],
  args: { items, children: <p>Inhalt der Seite</p> },
} satisfies Meta<typeof AppShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const ActiveInDrawer: Story = { parameters: { path: "/settings" } };
export const FewDestinations: Story = { args: { items: items.slice(0, 4) } };
export const Tablet: Story = { globals: { viewport: { value: "tablet", isRotated: false } } };

export const HeaderOnly: StoryObj<typeof GlobalHeader> = {
  render: () => <GlobalHeader items={items} />,
  globals: { viewport: { value: "tablet", isRotated: false } },
};

export const BarOnly: StoryObj<typeof MobileNavBar> = {
  render: () => <MobileNavBar items={items} />,
};

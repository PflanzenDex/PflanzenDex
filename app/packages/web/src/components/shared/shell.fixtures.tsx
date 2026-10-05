import type { Decorator } from "@storybook/react-vite";
import { MemoryRouter } from "react-router";
import type { NavItem } from "./nav-item";

// Shared sample data for the shell stories (TE-18): sample texts are German.
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
export const items: NavItem[] = labels.map((label, i) => ({
  href: paths[i] ?? "/",
  label,
  icon: dot,
}));

export const withRouter: Decorator = (Story, ctx) => (
  <MemoryRouter initialEntries={[String(ctx.parameters["path"] ?? "/")]}>
    <Story />
  </MemoryRouter>
);

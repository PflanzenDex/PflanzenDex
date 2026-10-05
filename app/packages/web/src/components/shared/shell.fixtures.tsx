import type { Decorator } from "@storybook/react-vite";
import {
  BookOpen,
  CalendarClock,
  Heart,
  Home,
  Leaf,
  Lightbulb,
  Package,
  Settings,
  Sprout,
  type LucideIcon,
} from "lucide-react";
import { MemoryRouter } from "react-router";
import type { NavItem } from "./nav-item";

// Shared sample data for the shell stories (TE-18): sample texts are German.
const icons: LucideIcon[] = [
  Home,
  Package,
  Sprout,
  BookOpen,
  Leaf,
  Lightbulb,
  CalendarClock,
  Heart,
  Settings,
];
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
export const items: NavItem[] = labels.map((label, i) => {
  const Icon = icons[i] ?? Home;
  return {
    href: paths[i] ?? "/",
    label,
    icon: <Icon aria-hidden="true" className="size-5 shrink-0" />,
  };
});

export const withRouter: Decorator = (Story, ctx) => (
  <MemoryRouter initialEntries={[String(ctx.parameters["path"] ?? "/")]}>
    <Story />
  </MemoryRouter>
);

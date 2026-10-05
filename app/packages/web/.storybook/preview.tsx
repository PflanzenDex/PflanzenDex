import type { Decorator, Preview } from "@storybook/react-vite";
import { useEffect } from "react";
import "../src/styles/tokens.css";
import "./preview.css";
import { applyColorScheme, type ColorScheme } from "./color-scheme";

export const withColorScheme: Decorator = (Story, context) => {
  const scheme: ColorScheme = context.globals.colorScheme === "dark" ? "dark" : "light";
  applyColorScheme(scheme);
  useEffect(() => applyColorScheme(scheme));
  return <Story />;
};

const preview: Preview = {
  decorators: [withColorScheme],
  globalTypes: {
    colorScheme: {
      description: "Color scheme (emulates prefers-color-scheme)",
      toolbar: {
        title: "Color scheme",
        icon: "circlehollow",
        items: [
          { value: "light", title: "Light", icon: "sun" },
          { value: "dark", title: "Dark", icon: "moon" },
        ],
        dynamicTitle: true,
      },
    },
  },
  parameters: {
    layout: "fullscreen",
    viewport: {
      options: {
        phone: {
          name: "Phone 360x640",
          styles: { width: "360px", height: "640px" },
          type: "mobile",
        },
        tablet: {
          name: "Tablet 768x1024",
          styles: { width: "768px", height: "1024px" },
          type: "tablet",
        },
      },
    },
    a11y: { test: "error" },
  },
  initialGlobals: { colorScheme: "light", viewport: { value: "phone", isRotated: false } },
};

export default preview;

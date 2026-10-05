import type { ReactNode } from "react";

/** One navigation destination: data only, never a module or domain object (DS-44). */
export type NavItem = {
  href: string;
  /** German label shown next to or under the icon. */
  label: string;
  /** Decorative icon; the label carries the meaning (DS-17). */
  icon: ReactNode;
};

export type Ci = "pending" | "success" | "failure" | "none";

export type WorktreeRow = {
  name: string;
  branch: string;
  pr: number | null;
  isDraft: boolean;
  ci: Ci;
};

export type Lock = { isHeld: false } | { isHeld: true; label: string; sinceMs: number };

export type Snapshot = {
  atMs: number;
  // Set when the session is not inside a git checkout: the panel shows only this.
  noRepo: boolean;
  // False when gh is missing or not signed in: the panel shows the local parts only.
  hasGh: boolean;
  login: string | null;
  errors: string[];
  worktrees: WorktreeRow[];
  lock: Lock;
  ownerMerge: { number: number; title: string }[];
  claimDrafts: number | null;
};

declare module "claude-code" {
  interface PluginState {
    "status-panel": { snap: Shaped<Snapshot | null> };
  }
}

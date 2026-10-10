// Rights of an AI connection (US-KI-07, FR-KI-12): ascending scopes and the class of every released operation.

/** The rights in ascending order; each includes the lower ones (US-KI-07). */
export const AI_RIGHTS = ["read", "drafts", "write"] as const;
export type AiRights = (typeof AI_RIGHTS)[number];

/** The OAuth scope names of the sign-in service (spike TE-15: `pflanzen:read`, `pflanzen:draft`, `pflanzen:write`). */
export const AI_SCOPES: Readonly<Record<AiRights, string>> = {
  read: "pflanzen:read",
  drafts: "pflanzen:draft",
  write: "pflanzen:write",
};

/** The default right of a new connection: create drafts (US-KI-07, E-04). */
export const DEFAULT_AI_RIGHTS: AiRights = "drafts";

export const rankOf = (rights: AiRights): number => AI_RIGHTS.indexOf(rights);
export const lowerOf = (a: AiRights, b: AiRights): AiRights => (rankOf(a) <= rankOf(b) ? a : b);
export const isAiRights = (value: unknown): value is AiRights =>
  typeof value === "string" && (AI_RIGHTS as readonly string[]).includes(value);

/** The highest right a space-separated scope string carries; `null` when it carries none of ours. */
export function rightsOfScope(scope: unknown): AiRights | null {
  if (typeof scope !== "string") return null;
  const names = new Set(scope.split(/\s+/));
  const found = AI_RIGHTS.filter((r) => names.has(AI_SCOPES[r]));
  return found.length === 0 ? null : (found[found.length - 1] as AiRights);
}

/** The class of a released operation (FR-KI-12). `never` is not released via connections at all (FR-KI-10). */
export type OperationClass = "read" | "draft" | "write" | "never";

/**
 * The one place that assigns every operation of the AI interface its class (FR-KI-12). An operation that is not listed is
 * not released. Later stories add their operations here; a test checks that the class matches the right.
 */
export const AI_OPERATION_CLASSES: Readonly<Record<string, OperationClass>> = {
  // Released (US-KI-02 adds `status`, US-KI-01 the reversible writes).
  status: "read",
  // Content results are drafts (KI-R3): the keeper adopts them in the app.
  propose_draft: "draft",
  // Never released via connections (FR-KI-10): friends' data, sharing, swaps, account, connections, partners.
  friends_data: "never",
  sharing_settings: "never",
  accept_swap: "never",
  hand_over: "never",
  delete_account: "never",
  export_account: "never",
  manage_connections: "never",
  partner_data: "never",
};

const NEEDED: Readonly<Record<Exclude<OperationClass, "never">, AiRights>> = {
  read: "read",
  draft: "drafts",
  write: "write",
};

/** The right an operation needs; `null` for an unknown or never released operation. */
export function rightNeeded(operation: string): AiRights | null {
  const cls = AI_OPERATION_CLASSES[operation];
  return cls === undefined || cls === "never" ? null : NEEDED[cls];
}

/** Whether a connection with these rights may call the operation (KI-R8: the server decides). */
export function mayCall(rights: AiRights, operation: string): boolean {
  const needed = rightNeeded(operation);
  return needed !== null && rankOf(rights) >= rankOf(needed);
}

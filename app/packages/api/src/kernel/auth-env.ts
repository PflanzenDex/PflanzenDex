import type { AccountData } from "@pflanzendex/core";

/** Account of the current request; authentication (module `account`) sets it, other modules only read it. */
type RequestAccount = { id: string; data: AccountData };
export type AuthEnv = { Variables: { account: RequestAccount } };

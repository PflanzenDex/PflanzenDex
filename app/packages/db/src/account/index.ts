// Public interface of the `account` module (ADR 0003).
export { admitAccount, findOrCreateAccount } from "./sign-in.ts";
export { AccessPostgres } from "./access.ts";
export { ProfilePostgres } from "./profile.ts";
export { FIXTURES_ACCOUNT } from "./fixtures.ts";

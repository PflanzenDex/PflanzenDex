// Hard lock of the demo seed (#924): it writes plenty of invented data, so it runs only on a local or test setup and
// refuses everything else, including an unset or unknown environment. Two independent checks must both pass.
export const SEED_ENVIRONMENTS = ["local", "test"] as const;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export class SeedRefused extends Error {}

/** Throws `SeedRefused` with the reason unless `PFLANZENDEX_ENV` is `local` or `test` and the database is on this machine. */
export function assertSeedAllowed(env: NodeJS.ProcessEnv, databaseUrl: string): void {
  const name = env["PFLANZENDEX_ENV"];
  if (name === undefined || name === "")
    throw new SeedRefused(
      `Demo seed refused: PFLANZENDEX_ENV is not set. Set it explicitly to one of: ${SEED_ENVIRONMENTS.join(", ")}.`,
    );
  if (name === "prod" || name === "production")
    throw new SeedRefused(
      "Demo seed refused: PFLANZENDEX_ENV is 'prod'. It never runs in production.",
    );
  if (!(SEED_ENVIRONMENTS as readonly string[]).includes(name))
    throw new SeedRefused(
      `Demo seed refused: unknown PFLANZENDEX_ENV '${name}'. Allowed: ${SEED_ENVIRONMENTS.join(", ")}.`,
    );
  if (env["NODE_ENV"] === "production")
    throw new SeedRefused("Demo seed refused: NODE_ENV is 'production'.");
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new SeedRefused("Demo seed refused: the database URL cannot be parsed.");
  }
  if (!LOOPBACK_HOSTS.has(url.hostname))
    throw new SeedRefused(
      `Demo seed refused: the database host '${url.hostname}' is not on this machine (localhost, 127.0.0.1 or ::1 only).`,
    );
  if (/prod/i.test(url.pathname))
    throw new SeedRefused(
      `Demo seed refused: the database name '${url.pathname.slice(1)}' looks like production.`,
    );
}

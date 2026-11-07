// Prints the Keycloak subjects of the demo users as `DEMO_SEED_SUBJECTS` (US-QG-01, issue 1199). After the shared
// Keycloak was re-imported the users have new subjects: signing in then creates empty accounts and the seeded data is
// orphaned. Reseed with the printed value; it needs no Keycloak admin password.
//
// Usage: node tools/measure/subjects.mjs
//   then: DEMO_SEED_SUBJECTS="<printed>" DEMO_SEED_PROFILE=states PFLANZENDEX_ENV=local npm run seed:demo -w @pflanzendex/api
import { API, PASSWORD, WEB, chromium } from "./lib.mjs";

const USERS = ["test", "test2", "test3"];
const browser = await chromium.launch();
const pairs = [];
for (const user of USERS) {
  const context = await browser.newContext();
  // The API is not needed: only the token the web app stores after the sign-in.
  await context.route(`${API}/**`, (route) => route.abort());
  const page = await context.newPage();
  await page.goto(`${WEB}/`);
  await page
    .getByRole("button", { name: /anmelden/i })
    .first()
    .click();
  await page.fill("#username", user);
  await page.fill("#password", PASSWORD);
  await page.click("#kc-login");
  await page.waitForURL(`${WEB}/**`, { timeout: 30_000 });
  await page.waitForTimeout(1500);
  const sub = await page.evaluate(() => {
    const stored = [...Object.values(sessionStorage), ...Object.values(localStorage)].join(" ");
    for (const token of stored.match(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g) ?? []) {
      try {
        const claims = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
        if (claims.sub) return claims.sub;
      } catch {
        // not a JWT payload: try the next token
      }
    }
    return null;
  });
  if (!sub) throw new Error(`no token with a subject found for ${user}`);
  pairs.push(`${user}=${sub}`);
  await context.close();
}
await browser.close();
console.log(pairs.join(","));

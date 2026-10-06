import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccountView, AppError, Loading, Welcome } from "./views";
import type { Account } from "./account-api";

const account: Account = {
  id: "1",
  email: "lena@example.test",
  displayName: "Lena",
  timeZone: null,
  emailConfirmed: true,
  mayShareWithFriends: true,
};
const nothing = () => undefined;

describe("welcome (US-ACC-01)", () => {
  it("offers register and sign in", () => {
    const html = renderToString(<Welcome onRegister={nothing} onSignIn={nothing} />);
    expect(html).toContain("Konto anlegen");
    expect(html).toContain("Anmelden");
  });

  it("US-QS-09 sign-in and sign-up ask for no puzzle and no code, they hand over to the sign-in service (3.3.8)", () => {
    const html = renderToString(<Welcome onRegister={nothing} onSignIn={nothing} />);
    expect(html).not.toMatch(/<input|captcha|<canvas|<iframe/i);
    expect(html.match(/<button/g)).toHaveLength(2);
  });

  it("names the next action after signing out", () => {
    const html = renderToString(
      <Welcome onRegister={nothing} onSignIn={nothing} hint="Du bist abgemeldet." />,
    );
    expect(html).toContain("Du bist abgemeldet.");
    expect(html).toContain('role="status"');
  });
});

describe("signed-in view (US-ACC-01)", () => {
  const props = { onSignOut: nothing, onEverywhereSignOut: nothing };

  it("shows name and email and both ways to sign out", () => {
    const html = renderToString(<AccountView account={account} {...props} />);
    expect(html).toContain("Lena");
    expect(html).toContain("lena@example.test");
    expect(html).toContain("Abmelden");
    expect(html).toContain("Auf allen Geräten abmelden");
  });

  it("for an unconfirmed email points out what to do", () => {
    const html = renderToString(
      <AccountView
        account={{ ...account, emailConfirmed: false, mayShareWithFriends: false }}
        {...props}
      />,
    );
    expect(html).toContain("E-Mail-Adresse bestätigen");
    expect(html).toContain("Teilen mit Freunden");
  });

  it("shows no warning for a confirmed email", () => {
    const html = renderToString(<AccountView account={account} {...props} />);
    expect(html).not.toContain("bestätigen");
  });
});

describe("loading and error states (US-ACC-01 · DS-26, DS-52)", () => {
  it("US-ACC-01 · DS-52 loading is a skeleton with the one status text", () => {
    const html = renderToString(<Loading />);
    expect(html).toContain('role="status"');
    expect(html).toContain("Anmeldung wird geprüft");
    expect(html).toContain('aria-hidden="true"');
  });

  it("US-ACC-01 · DS-26 the error says what happened and offers 'Erneut versuchen'", () => {
    const html = renderToString(<AppError text="Der Server antwortet nicht." onReload={nothing} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Der Server antwortet nicht.");
    expect(html).toContain("Erneut versuchen");
  });
});

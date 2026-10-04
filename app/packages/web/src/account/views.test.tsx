import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccountView, Welcome } from "./views";
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

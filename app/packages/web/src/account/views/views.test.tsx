import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppError, Loading, Welcome } from "./views";
import { AccountView } from "./account-views/account-views";
import type { Account } from "../api/account-api";

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
  it("US-ACC-01 a failed Anderes Konto shows its error as an alert, and the buttons stay for another try (P-10)", () => {
    const html = renderToString(
      <Welcome
        onRegister={nothing}
        onSignIn={nothing}
        onAnotherAccount={nothing}
        error="Abmelden hat nicht geklappt: Prüfe deine Verbindung und versuche es noch einmal."
      />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("Abmelden hat nicht geklappt");
    expect(html).toContain("Anderes Konto");
  });

  it("offers register and sign in", () => {
    const html = renderToString(
      <Welcome onRegister={nothing} onSignIn={nothing} onAnotherAccount={nothing} />,
    );
    expect(html).toContain("Konto anlegen");
    expect(html).toContain("Anmelden");
  });

  it("US-QS-09 sign-in and sign-up ask for no puzzle and no code, they hand over to the sign-in service (3.3.8)", () => {
    const html = renderToString(
      <Welcome onRegister={nothing} onSignIn={nothing} onAnotherAccount={nothing} />,
    );
    expect(html).not.toMatch(/<input|captcha|<canvas|<iframe/i);
    expect(html.match(/<button/g)).toHaveLength(3);
  });

  it("US-ACC-01 offers 'Anderes Konto' last, after sign-in and registration", () => {
    const html = renderToString(
      <Welcome onRegister={nothing} onSignIn={nothing} onAnotherAccount={nothing} />,
    );
    const [signIn, register, other] = html.split("<button").slice(1);
    expect(signIn).toContain(">Anmelden<");
    expect(register).toContain(">Konto anlegen<");
    expect(other).toContain(">Anderes Konto<");
  });

  it("names the next action after signing out", () => {
    const html = renderToString(
      <Welcome
        onRegister={nothing}
        onSignIn={nothing}
        onAnotherAccount={nothing}
        hint="Du bist abgemeldet."
      />,
    );
    expect(html).toContain("Du bist abgemeldet.");
    expect(html).toContain('role="status"');
  });
});

describe("welcome in the sign-in frame (US-QS-14)", () => {
  it("US-QS-14 shows the wordmark, the three value lines and a drawing that assistive technology skips", () => {
    const html = renderToString(
      <Welcome onRegister={nothing} onSignIn={nothing} onAnotherAccount={nothing} />,
    );
    expect(html).toContain("PflanzenDéx");
    expect(html).toContain("Sammle deine Pflanzen wie Karten");
    expect(html).toContain("Miss Wachstum gegen deine eigene Geschichte");
    expect(html).toContain("Tausche Stecklinge mit Freunden");
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
  });

  it("US-QS-14 sign-in is the filled button and comes first, registration the outline button", () => {
    const html = renderToString(
      <Welcome onRegister={nothing} onSignIn={nothing} onAnotherAccount={nothing} />,
    );
    const [signIn, register] = html.split("<button").slice(1);
    expect(signIn).toContain(">Anmelden<");
    expect(signIn).toContain("bg-primary text-primary-foreground");
    expect(register).toContain(">Konto anlegen<");
    expect(register).toContain("border border-primary bg-transparent");
    expect(register).not.toContain("bg-primary text-primary-foreground");
  });

  it("US-QS-14 offers no language choice on the card", () => {
    const html = renderToString(
      <Welcome onRegister={nothing} onSignIn={nothing} onAnotherAccount={nothing} />,
    );
    expect(html).not.toMatch(/<select|lang=|Sprache|language/i);
  });
});

describe("signed-in view (US-ACC-01)", () => {
  it("US-ACC-01 shows name and email and no sign-out of its own: signing out always asks first, in the index", () => {
    const html = renderToString(<AccountView account={account} />);
    expect(html).toContain("Lena");
    expect(html).toContain("lena@example.test");
    expect(html).not.toContain("Abmelden");
    expect(html).not.toContain("<button");
  });

  it("for an unconfirmed email points out what to do", () => {
    const html = renderToString(
      <AccountView account={{ ...account, emailConfirmed: false, mayShareWithFriends: false }} />,
    );
    expect(html).toContain("E-Mail-Adresse bestätigen");
    expect(html).toContain("Teilen mit Freunden");
  });

  it("shows no warning for a confirmed email", () => {
    const html = renderToString(<AccountView account={account} />);
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

-- Artenkatalog (US-BES-01, DM-BES-01, FR-BES-02/05/11, E-02, P-04/P-05).
-- Der Katalog ist gemeinsam und trägt deshalb keine Konto-Kennung. Wer eine Art sieht, bestimmt ihr Prüfvorgang
-- (pruefvorgang aus 0002): Vorschläge nur der Ersteller, freigegebene (kuratiert, geprueft) alle. Der Katalog
-- steht begründet in OHNE_KONTO_KENNUNG (schema.ts); seine Zeilenregeln beweist db/src/art.test.ts.

-- Prüfstatus und Eigentum einer Art, soweit der Aufrufer sie sehen darf. Läuft mit Eigentümerrechten, weil die
-- Prüfliste (pruefvorgang) fremde Vorgänge sonst verbirgt; die Funktion verrät nur den Status sichtbarer Arten.
create function art_status(p_art uuid) returns text
language sql stable security definer set search_path = public, pg_temp
as $$
  select v.status from pruefvorgang v
   where v.objekt_art = 'art' and v.objekt_id = p_art
     and (v.status in ('kuratiert', 'geprueft') or v.konto_id = aktuelles_konto())
$$;

create function art_eigen(p_art uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (select from pruefvorgang v
                  where v.objekt_art = 'art' and v.objekt_id = p_art and v.konto_id = aktuelles_konto())
$$;

revoke all on function art_status(uuid), art_eigen(uuid) from public;
grant execute on function art_status(uuid), art_eigen(uuid) to pflanzendex_app;

-- pruefvorgang erzwingt die Zeilenregeln auch für den Eigentümer. Damit art_status() freigegebene Vorgänge sieht,
-- darf genau die Eigentümerrolle sie lesen (nie die Anwendungsrolle, die kein Mitglied der Eigentümerrolle ist).
do $$
begin
  execute format(
    'create policy katalog_freigegeben on pruefvorgang for select to %I using (status in (''kuratiert'', ''geprueft''))',
    current_user
  );
end
$$;

create table art (
  id uuid primary key default gen_random_uuid(),
  objekt_art text not null default 'art' check (objekt_art = 'art'),
  gattung text not null check (char_length(gattung) between 2 and 60),
  epitheton text check (char_length(epitheton) between 2 and 60),
  sorte text check (char_length(sorte) between 1 and 60),
  lateinischer_name text not null check (char_length(lateinischer_name) between 2 and 160),
  deutscher_name text check (char_length(deutscher_name) between 1 and 120),
  englischer_name text check (char_length(englischer_name) between 1 and 120),
  familie_deutsch text check (char_length(familie_deutsch) between 1 and 120),
  familie_lateinisch text check (char_length(familie_lateinisch) between 1 and 120),
  schwierigkeit smallint not null check (schwierigkeit between 1 and 3),
  standard_stufe smallint not null check (standard_stufe between 2 and 4),
  lichtbedarf_lux integer not null check (lichtbedarf_lux between 1 and 200000),
  -- Monat-Tag ohne Jahr (darf über den Jahreswechsel gehen); beide oder keiner, sonst „unbekannt“ (P-08).
  ruhe_von text check (ruhe_von ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  ruhe_bis text check (ruhe_bis ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  check ((ruhe_von is null) = (ruhe_bis is null)),
  standort_hinweis text check (char_length(standort_hinweis) between 1 and 200),
  wachstumsmass text not null check (wachstumsmass in ('hoehe', 'rosettendurchmesser', 'trieblaenge')),
  vergeilung_anzeichen text not null check (char_length(vergeilung_anzeichen) between 1 and 1000),
  giesshinweis text check (char_length(giesshinweis) between 1 and 200),
  substrat text check (char_length(substrat) between 1 and 200),
  rueckschnitt text check (char_length(rueckschnitt) between 1 and 200),
  wuchs_hacks text check (char_length(wuchs_hacks) between 1 and 200),
  erfolgskriterien text not null check (char_length(erfolgskriterien) between 1 and 1000),
  botanische_story text check (char_length(botanische_story) between 1 and 1000),
  quelle text check (char_length(quelle) between 1 and 200),
  erstellt_von text not null check (erstellt_von in ('betreiber', 'pruefer', 'nutzer')),
  version integer not null default 1,
  angelegt_am timestamptz not null default now(),
  -- Jede Art hat genau einen Prüfvorgang. RESTRICT: das Löschen eines Kontos darf keine Katalogart mitnehmen.
  foreign key (objekt_art, id) references pruefvorgang (objekt_art, objekt_id) on delete restrict
);
alter table art enable row level security;
alter table art force row level security;
create policy sichtbar on art for select using (art_status(id) is not null);
create policy vorschlagen on art for insert with check (art_eigen(id));
-- Bewusst keine Regeln und keine Rechte für Ändern und Löschen: Katalogpflege ist Sache der Prüfer (BES-10, POK-02).
grant select, insert on art to pflanzendex_app;

-- Namen und Synonyme einer Art mit Suchschlüssel (klein, ohne Akzente; Normierung in core/art/name.ts).
create table art_name (
  art_id uuid not null references art(id) on delete cascade,
  feld text not null check (feld in ('lateinisch', 'deutsch', 'englisch', 'synonym')),
  anzeige text not null check (char_length(anzeige) between 1 and 160),
  norm text not null check (norm <> ''),
  primary key (art_id, feld, norm)
);
create index art_name_norm on art_name (norm);
alter table art_name enable row level security;
alter table art_name force row level security;
create policy sichtbar on art_name for select using (art_status(art_id) is not null);
create policy vorschlagen on art_name for insert with check (art_eigen(art_id));
grant select, insert on art_name to pflanzendex_app;

-- Nutzer legen nur als „nutzer“ an; „betreiber“ und „pruefer“ sind Prüfern vorbehalten (FR-BES-02). Version startet bei 1.
create function art_wache() returns trigger
language plpgsql
as $$
begin
  if new.erstellt_von <> 'nutzer' and not ist_pruefer() then
    raise exception 'Erstellt von % darf nur ein Betreiber oder Prüfer angeben', new.erstellt_von using errcode = '42501';
  end if;
  new.version := 1;
  return new;
end
$$;
create trigger art_wache before insert on art for each row execute function art_wache();

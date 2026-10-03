-- Mandantengrundlage (FR-ACC-02, NFR-09, P-04): Konto-Tabelle, Anwendungsrolle und Zeilenebene-Regeln.
-- Portabel (E-01): nur PostgreSQL-Standard, die Regeln lesen die Sitzungsvariable `app.konto_id`,
-- die die Anwendung je Transaktion setzt (`set_config(..., true)`).

-- Die Anwendung arbeitet als diese Rolle: kein Eigentümer, kein BYPASSRLS, daher immer den Regeln unterworfen.
do $$
begin
  if not exists (select from pg_roles where rolname = 'pflanzendex_app') then
    create role pflanzendex_app nologin;
  end if;
end
$$;
grant pflanzendex_app to current_user;

-- Fehlt die Variable oder ist sie leer, ist das Ergebnis NULL und keine Zeile passt (sicherer Ausgang).
create function aktuelles_konto() returns uuid
language sql stable
as $$ select nullif(current_setting('app.konto_id', true), '')::uuid $$;

-- Schaltet für eine Tabelle die Mandantentrennung ein. Jede nutzerbezogene Tabelle ruft das nach `create table` auf.
-- Die Tabelle muss die Spalte `kennung` (Standard `konto_id`, Typ uuid) tragen; dafür sorgt die Schemaprüfung.
create function mandantenschutz(tabelle regclass, kennung name default 'konto_id') returns void
language plpgsql
as $$
begin
  execute format('alter table %s enable row level security', tabelle);
  execute format('alter table %s force row level security', tabelle);
  execute format(
    'create policy mandant on %s using (%I = aktuelles_konto()) with check (%I = aktuelles_konto())',
    tabelle, kennung, kennung
  );
  execute format('grant select, insert, update, delete on %s to pflanzendex_app', tabelle);
end
$$;

-- Wurzel der Mandanten: die Kennung des Kontos ist die Zeilenkennung selbst.
create table konto (
  id uuid primary key default gen_random_uuid(),
  angelegt_am timestamptz not null default now()
);
select mandantenschutz('konto', 'id');

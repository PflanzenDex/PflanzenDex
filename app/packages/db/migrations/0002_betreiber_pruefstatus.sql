-- Betreiber-Rolle und generischer Prüfstatus für den gemeinsamen Katalog (TE-08, FR-BES-02/06/11/14, E-02, P-04).
-- Der Artenkatalog selbst entsteht erst mit BES-01; hier liegt nur der Mechanismus, der später an ihn andockt.

-- Rollen: vergeben nur von Hand durch den Betreiber der Installation (Verwaltungszugang), nie über die Anwendung.
-- Die Anwendungsrolle hat keinerlei Rechte auf die Tabelle; sie liest ihre eigene Rolle nur über rollen_des_kontos().
create table konto_rolle (
  konto uuid not null references konto(id) on delete cascade,
  rolle text not null check (rolle in ('betreiber', 'pruefer')),
  vergeben_am timestamptz not null default now(),
  primary key (konto, rolle)
);
revoke all on konto_rolle from public;

-- Nur die Rollen des Kontos der Sitzung, nie die anderer Konten. Läuft mit Eigentümerrechten (security definer).
create function rollen_des_kontos() returns setof text
language sql stable security definer set search_path = public, pg_temp
as $$ select rolle from konto_rolle where konto = aktuelles_konto() order by rolle $$;

create function ist_pruefer() returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$ select exists (select from konto_rolle where konto = aktuelles_konto()) $$;

revoke all on function rollen_des_kontos(), ist_pruefer() from public;
grant execute on function rollen_des_kontos(), ist_pruefer() to pflanzendex_app;

-- Prüfvorgang je Katalogobjekt. Er trägt nur Metadaten (Art und Kennung des Objekts, Status), nie den Inhalt:
-- der bleibt in der Tabelle des Objekts und dort beim Konto des Erstellers (FR-BES-11).
create table pruefvorgang (
  id uuid primary key default gen_random_uuid(),
  konto_id uuid not null references konto(id) on delete cascade,
  objekt_art text not null check (objekt_art ~ '^[a-z_]{1,40}$'),
  objekt_id uuid not null,
  status text not null check (status in ('vorschlag', 'ki_ungeprueft', 'kuratiert', 'geprueft', 'zurueckgewiesen')),
  grund text check (char_length(grund) <= 500),
  geprueft_von uuid references konto(id) on delete set null,
  geprueft_am timestamptz,
  angelegt_am timestamptz not null default now(),
  unique (objekt_art, objekt_id),
  check (status <> 'zurueckgewiesen' or grund is not null)
);
-- Wie jede nutzerbezogene Tabelle: Konto (= Ersteller) sieht und ändert nur die eigenen Vorgänge.
select mandantenschutz('pruefvorgang');
-- Zusätzlich dürfen Prüfer die Prüfliste lesen und den Status ändern. Das gibt ihnen Metadaten, keinen Inhalt.
create policy pruefer_liest on pruefvorgang for select using (ist_pruefer());
create policy pruefer_entscheidet on pruefvorgang for update using (ist_pruefer()) with check (ist_pruefer());

-- Erzwingt die Rechte auch gegen jeden Fehler der Anwendung: Nutzer legen nur Vorschläge an und ändern nichts am
-- Status; Prüfer ändern nur Status, Grund und Prüfvermerk, und der Vermerk stammt immer aus der Sitzung.
create function pruefvorgang_wache() returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.status not in ('vorschlag', 'ki_ungeprueft') and not (new.status = 'kuratiert' and ist_pruefer()) then
      raise exception 'Prüfstatus % darf nur ein Prüfer anlegen', new.status using errcode = '42501';
    end if;
    new.grund := null;
    new.geprueft_von := case when new.status = 'kuratiert' then aktuelles_konto() end;
    new.geprueft_am := case when new.status = 'kuratiert' then now() end;
    return new;
  end if;
  if to_jsonb(new) = to_jsonb(old) then
    return new;
  end if;
  if (new.id, new.konto_id, new.objekt_art, new.objekt_id, new.angelegt_am)
     is distinct from (old.id, old.konto_id, old.objekt_art, old.objekt_id, old.angelegt_am) then
    raise exception 'Prüfvorgang: Zuordnung ist unveränderlich' using errcode = '42501';
  end if;
  if not ist_pruefer() then
    raise exception 'Nur Betreiber oder Prüfer ändern den Prüfstatus' using errcode = '42501';
  end if;
  if new.status in ('vorschlag', 'ki_ungeprueft', 'kuratiert') then
    raise exception 'Prüfstatus % lässt sich nicht nachträglich setzen', new.status using errcode = '42501';
  end if;
  new.geprueft_von := aktuelles_konto();
  new.geprueft_am := now();
  return new;
end
$$;
create trigger pruefvorgang_wache before insert or update on pruefvorgang
  for each row execute function pruefvorgang_wache();
